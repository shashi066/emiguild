import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { runSerializableTransaction } from '@/lib/prisma-transaction';

export const FNB_STOCK_MOVEMENT_TYPES = [
  'INITIAL_STOCK',
  'RESTOCK',
  'SALE',
  'SALE_VOID',
  'WASTE',
  'ADJUSTMENT',
] as const;

const productInputSchema = z.object({
  name: z.string().trim().min(1).max(120),
  category: z.string().trim().min(1).max(60),
  sku: z.string().trim().max(80).nullable().optional(),
  sellingPrice: z.number().int().min(0),
  costPrice: z.number().int().min(0).nullable().optional(),
  lowStockThreshold: z.number().int().min(0).default(0),
  isActive: z.boolean().default(true),
  initialStock: z.number().int().min(0).default(0),
});

const productUpdateSchema = productInputSchema
  .omit({ initialStock: true })
  .partial()
  .refine((value) => Object.keys(value).length > 0, 'Provide at least one product field.');

const stockAdjustmentSchema = z.object({
  type: z.enum(['RESTOCK', 'WASTE', 'ADJUSTMENT']),
  quantityChange: z.number().int().refine((value) => value !== 0, 'Quantity must not be zero.'),
  unitCost: z.number().int().min(0).nullable().optional(),
  note: z.string().trim().min(1).max(500),
}).superRefine((value, ctx) => {
  if (value.type === 'RESTOCK' && value.quantityChange < 0) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Restocks must increase stock.', path: ['quantityChange'] });
  }
  if (value.type === 'WASTE' && value.quantityChange > 0) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Waste must decrease stock.', path: ['quantityChange'] });
  }
});

const bookingItemInputSchema = z.object({
  productId: z.string().trim().min(1),
  quantity: z.number().int().positive(),
});

const voidBookingItemSchema = z.object({
  reason: z.string().trim().min(1).max(500),
});

export type FnbProductInput = z.infer<typeof productInputSchema>;
export type FnbProductUpdate = z.infer<typeof productUpdateSchema>;
export type FnbStockAdjustment = z.infer<typeof stockAdjustmentSchema>;

export class FnbInventoryError extends Error {
  constructor(
    message: string,
    readonly status: number = 400,
    readonly code?: string,
  ) {
    super(message);
  }
}

function normalizeSku(sku: string | null | undefined) {
  return sku?.trim() || null;
}

function serializeProduct<T extends { sellingPrice: number; costPrice: number | null }>(product: T) {
  return product;
}

export function parseFnbProductInput(body: unknown) {
  const result = productInputSchema.safeParse(body);
  if (!result.success) throw new FnbInventoryError(result.error.issues[0]?.message ?? 'Invalid product.', 400, 'INVALID_PRODUCT');
  return { ...result.data, sku: normalizeSku(result.data.sku) };
}

export function parseFnbProductUpdate(body: unknown) {
  const result = productUpdateSchema.safeParse(body);
  if (!result.success) throw new FnbInventoryError(result.error.issues[0]?.message ?? 'Invalid product update.', 400, 'INVALID_PRODUCT');
  return {
    ...result.data,
    ...(Object.prototype.hasOwnProperty.call(result.data, 'sku') ? { sku: normalizeSku(result.data.sku) } : {}),
  };
}

export function parseFnbStockAdjustment(body: unknown) {
  const result = stockAdjustmentSchema.safeParse(body);
  if (!result.success) throw new FnbInventoryError(result.error.issues[0]?.message ?? 'Invalid stock adjustment.', 400, 'INVALID_STOCK_ADJUSTMENT');
  return result.data;
}

export function parseBookingFnbItem(body: unknown) {
  const result = bookingItemInputSchema.safeParse(body);
  if (!result.success) throw new FnbInventoryError(result.error.issues[0]?.message ?? 'Invalid F&B item.', 400, 'INVALID_BOOKING_ITEM');
  return result.data;
}

export function parseVoidBookingFnbItem(body: unknown) {
  const result = voidBookingItemSchema.safeParse(body);
  if (!result.success) throw new FnbInventoryError(result.error.issues[0]?.message ?? 'A void reason is required.', 400, 'INVALID_VOID');
  return result.data;
}

export async function createFnbProduct(actorId: string, input: FnbProductInput) {
  try {
    return await runSerializableTransaction(async (tx) => {
      const product = await tx.fnbProduct.create({
        data: {
          name: input.name,
          category: input.category,
          sku: normalizeSku(input.sku),
          sellingPrice: input.sellingPrice,
          costPrice: input.costPrice ?? null,
          currentStock: input.initialStock,
          lowStockThreshold: input.lowStockThreshold,
          isActive: input.isActive,
        },
      });
      if (input.initialStock > 0) {
        await tx.fnbStockMovement.create({
          data: {
            productId: product.id,
            actorId,
            type: 'INITIAL_STOCK',
            quantityChange: input.initialStock,
            unitCost: input.costPrice ?? null,
            note: 'Initial stock when product was created.',
          },
        });
      }
      return serializeProduct(product);
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      throw new FnbInventoryError('That SKU is already in use.', 409, 'DUPLICATE_SKU');
    }
    throw error;
  }
}

export async function updateFnbProduct(productId: string, input: FnbProductUpdate) {
  try {
    return serializeProduct(await runSerializableTransaction(async (tx) => {
      const product = await tx.fnbProduct.update({
        where: { id: productId },
        data: input,
      });
      return product;
    }));
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {
      throw new FnbInventoryError('F&B product not found.', 404, 'PRODUCT_NOT_FOUND');
    }
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      throw new FnbInventoryError('That SKU is already in use.', 409, 'DUPLICATE_SKU');
    }
    throw error;
  }
}

export async function adjustFnbStock(productId: string, actorId: string, input: FnbStockAdjustment) {
  return runSerializableTransaction(async (tx) => {
    const product = await tx.fnbProduct.findUnique({ where: { id: productId } });
    if (!product) throw new FnbInventoryError('F&B product not found.', 404, 'PRODUCT_NOT_FOUND');
    const nextStock = product.currentStock + input.quantityChange;
    if (nextStock < 0) {
      throw new FnbInventoryError(`Only ${product.currentStock} unit(s) are in stock.`, 409, 'INSUFFICIENT_STOCK');
    }
    const updatedProduct = await tx.fnbProduct.update({
      where: { id: product.id },
      data: { currentStock: nextStock },
    });
    const movement = await tx.fnbStockMovement.create({
      data: {
        productId: product.id,
        actorId,
        type: input.type,
        quantityChange: input.quantityChange,
        unitCost: input.unitCost ?? (input.type === 'WASTE' ? product.costPrice : null),
        note: input.note,
      },
    });
    return { product: serializeProduct(updatedProduct), movement };
  });
}

export async function addBookingFnbItem(bookingId: string, actorId: string, input: { productId: string; quantity: number }) {
  return runSerializableTransaction(async (tx) => {
    const [booking, product] = await Promise.all([
      tx.booking.findUnique({ where: { id: bookingId }, select: { id: true, status: true } }),
      tx.fnbProduct.findUnique({ where: { id: input.productId } }),
    ]);
    if (!booking) throw new FnbInventoryError('Booking not found.', 404, 'BOOKING_NOT_FOUND');
    if (booking.status === 'CANCELLED') throw new FnbInventoryError('Cannot add F&B items to a cancelled booking.', 409, 'BOOKING_CANCELLED');
    if (!product || !product.isActive) throw new FnbInventoryError('F&B product is unavailable.', 404, 'PRODUCT_UNAVAILABLE');
    if (product.currentStock < input.quantity) {
      throw new FnbInventoryError(`Only ${product.currentStock} unit(s) of ${product.name} are in stock.`, 409, 'INSUFFICIENT_STOCK');
    }

    const subtotal = product.sellingPrice * input.quantity;
    const item = await tx.bookingFnbItem.create({
      data: {
        bookingId,
        productId: product.id,
        productName: product.name,
        unitPrice: product.sellingPrice,
        quantity: input.quantity,
        subtotal,
      },
      include: { product: true },
    });
    await tx.fnbProduct.update({
      where: { id: product.id },
      data: { currentStock: product.currentStock - input.quantity },
    });
    await tx.fnbStockMovement.create({
      data: {
        productId: product.id,
        bookingFnbItemId: item.id,
        actorId,
        type: 'SALE',
        quantityChange: -input.quantity,
        note: `Sold against booking ${bookingId}.`,
      },
    });
    return item;
  });
}

export async function voidBookingFnbItem(itemId: string, actorId: string, reason: string) {
  return runSerializableTransaction(async (tx) => {
    const item = await tx.bookingFnbItem.findUnique({
      where: { id: itemId },
      include: { product: true },
    });
    if (!item) throw new FnbInventoryError('F&B booking item not found.', 404, 'BOOKING_ITEM_NOT_FOUND');
    if (item.status !== 'ACTIVE') throw new FnbInventoryError('This F&B item has already been voided.', 409, 'BOOKING_ITEM_NOT_ACTIVE');

    const voidedItem = await tx.bookingFnbItem.update({
      where: { id: item.id },
      data: { status: 'VOID', voidedAt: new Date(), voidedById: actorId, voidReason: reason },
      include: { product: true },
    });
    await tx.fnbProduct.update({
      where: { id: item.productId },
      data: { currentStock: item.product.currentStock + item.quantity },
    });
    await tx.fnbStockMovement.create({
      data: {
        productId: item.productId,
        bookingFnbItemId: item.id,
        actorId,
        type: 'SALE_VOID',
        quantityChange: item.quantity,
        note: reason,
      },
    });
    return voidedItem;
  });
}

export async function getFnbBookingItems(bookingId: string) {
  return prisma.bookingFnbItem.findMany({
    where: { bookingId },
    include: {
      product: {
        select: { id: true, name: true, category: true, isActive: true },
      },
      voidedBy: { select: { id: true, name: true } },
    },
    orderBy: { createdAt: 'desc' },
  });
}

export async function getFnbProducts(includeInactive = false) {
  return prisma.fnbProduct.findMany({
    where: includeInactive ? undefined : { isActive: true },
    orderBy: [{ isActive: 'desc' }, { category: 'asc' }, { name: 'asc' }],
  });
}

export async function getFnbInventoryOverview() {
  const [products, recentMovements] = await Promise.all([
    getFnbProducts(true),
    prisma.fnbStockMovement.findMany({
      take: 20,
      orderBy: { createdAt: 'desc' },
      include: {
        product: { select: { id: true, name: true } },
        actor: { select: { id: true, name: true } },
        bookingFnbItem: { select: { id: true, bookingId: true, productName: true } },
      },
    }),
  ]);
  const activeProducts = products.filter((product) => product.isActive);
  const lowStockProducts = activeProducts.filter(
    (product) => product.currentStock > 0 && product.currentStock <= product.lowStockThreshold,
  );
  return {
    products,
    recentMovements,
    summary: {
      activeProductCount: activeProducts.length,
      lowStockCount: lowStockProducts.length,
      outOfStockCount: activeProducts.filter((product) => product.currentStock === 0).length,
      stockCostValue: activeProducts.reduce(
        (total, product) => total + (product.costPrice ?? 0) * product.currentStock,
        0,
      ),
    },
  };
}

function reportBoundary(date: string, endExclusive = false) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    throw new FnbInventoryError('Use YYYY-MM-DD dates for the F&B report.', 400, 'INVALID_REPORT_DATE');
  }
  const boundary = new Date(`${date}T00:00:00.000+05:30`);
  if (Number.isNaN(boundary.getTime())) {
    throw new FnbInventoryError('Use valid F&B report dates.', 400, 'INVALID_REPORT_DATE');
  }
  if (endExclusive) boundary.setUTCDate(boundary.getUTCDate() + 1);
  return boundary;
}

export async function getFnbRevenueReport(from: string, to: string) {
  const start = reportBoundary(from);
  const end = reportBoundary(to, true);
  if (start >= end) throw new FnbInventoryError('The report end date must be on or after the start date.', 400, 'INVALID_REPORT_RANGE');
  const salesWhere = { status: 'ACTIVE', createdAt: { gte: start, lt: end } } as const;
  const wasteWhere = { type: 'WASTE', createdAt: { gte: start, lt: end } } as const;
  const [sales, salesCount, productSales, wasteMovements] = await Promise.all([
    prisma.bookingFnbItem.aggregate({ where: salesWhere, _sum: { subtotal: true, quantity: true } }),
    prisma.bookingFnbItem.count({ where: salesWhere }),
    prisma.bookingFnbItem.groupBy({
      by: ['productId', 'productName'],
      where: salesWhere,
      _sum: { quantity: true, subtotal: true },
      orderBy: { _sum: { subtotal: 'desc' } },
      take: 20,
    }),
    prisma.fnbStockMovement.findMany({
      where: wasteWhere,
      select: { quantityChange: true, unitCost: true },
    }),
  ]);
  const wasteUnits = wasteMovements.reduce((total, movement) => total + Math.abs(movement.quantityChange), 0);
  const wasteCost = wasteMovements.reduce(
    (total, movement) => total + Math.abs(movement.quantityChange) * (movement.unitCost ?? 0),
    0,
  );
  return {
    from,
    to,
    revenue: sales._sum.subtotal ?? 0,
    saleCount: salesCount,
    unitsSold: sales._sum.quantity ?? 0,
    wasteUnits,
    wasteCost,
    topProducts: productSales.map((product) => ({
      productId: product.productId,
      name: product.productName,
      quantity: product._sum.quantity ?? 0,
      revenue: product._sum.subtotal ?? 0,
    })),
  };
}
