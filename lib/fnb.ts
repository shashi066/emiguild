import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { runSerializableTransaction } from '@/lib/prisma-transaction';
import { MAX_FNB_QUANTITY } from '@/lib/fnb-rules';

export { MAX_FNB_QUANTITY } from '@/lib/fnb-rules';

const productSelect = {
  id: true,
  name: true,
  sellingPrice: true,
  isActive: true,
} satisfies Prisma.FnbProductSelect;

const bookingItemSelect = {
  id: true,
  bookingId: true,
  productId: true,
  productName: true,
  unitPrice: true,
  quantity: true,
  subtotal: true,
  status: true,
  voidedAt: true,
  voidedById: true,
  voidReason: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.BookingFnbItemSelect;

const productInputSchema = z.object({
  name: z.string().trim().min(1).max(120),
  sellingPrice: z.number().int().min(0),
}).strict();

const productUpdateSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  sellingPrice: z.number().int().min(0).optional(),
  isActive: z.boolean().optional(),
}).strict().refine(
  (value) => Object.keys(value).length > 0,
  'Provide at least one item field.',
);

const bookingItemInputSchema = z.object({
  productId: z.string().trim().min(1),
  quantity: z.number().int().min(1).max(MAX_FNB_QUANTITY),
}).strict();

export type FnbProductInput = z.infer<typeof productInputSchema>;
export type FnbProductUpdate = z.infer<typeof productUpdateSchema>;

export class FnbError extends Error {
  constructor(
    message: string,
    readonly status: number = 400,
    readonly code?: string,
  ) {
    super(message);
  }
}

export function parseFnbProductInput(body: unknown) {
  const result = productInputSchema.safeParse(body);
  if (!result.success) {
    throw new FnbError(
      result.error.issues[0]?.message ?? 'Invalid F&B item.',
      400,
      'INVALID_PRODUCT',
    );
  }
  return result.data;
}

export function parseFnbProductUpdate(body: unknown) {
  const result = productUpdateSchema.safeParse(body);
  if (!result.success) {
    throw new FnbError(
      result.error.issues[0]?.message ?? 'Invalid F&B item update.',
      400,
      'INVALID_PRODUCT',
    );
  }
  return result.data;
}

export function parseBookingFnbItem(body: unknown) {
  const result = bookingItemInputSchema.safeParse(body);
  if (!result.success) {
    throw new FnbError(
      result.error.issues[0]?.message ?? 'Invalid F&B item.',
      400,
      'INVALID_BOOKING_ITEM',
    );
  }
  return result.data;
}

export async function createFnbProduct(input: FnbProductInput) {
  return prisma.fnbProduct.create({
    data: input,
    select: productSelect,
  });
}

export async function updateFnbProduct(
  productId: string,
  input: FnbProductUpdate,
) {
  try {
    return await prisma.fnbProduct.update({
      where: { id: productId },
      data: input,
      select: productSelect,
    });
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError
      && error.code === 'P2025'
    ) {
      throw new FnbError('F&B item not found.', 404, 'PRODUCT_NOT_FOUND');
    }
    throw error;
  }
}

export async function getFnbProducts(includeInactive = false) {
  return prisma.fnbProduct.findMany({
    where: includeInactive ? undefined : { isActive: true },
    orderBy: [{ sellingPrice: 'asc' }, { name: 'asc' }],
    select: productSelect,
  });
}

export async function getActiveFnbSubtotals(bookingIds: string[]) {
  const uniqueBookingIds = [...new Set(bookingIds.filter(Boolean))];
  if (uniqueBookingIds.length === 0) return new Map<string, number>();

  const subtotals = await prisma.bookingFnbItem.groupBy({
    by: ['bookingId'],
    where: {
      bookingId: { in: uniqueBookingIds },
      status: 'ACTIVE',
    },
    _sum: { subtotal: true },
  });

  return new Map(subtotals.map((entry) => [
    entry.bookingId,
    entry._sum.subtotal ?? 0,
  ]));
}

export async function addBookingFnbItem(
  bookingId: string,
  input: { productId: string; quantity: number },
) {
  return runSerializableTransaction(async (tx) => {
    const [booking, product] = await Promise.all([
      tx.booking.findUnique({
        where: { id: bookingId },
        select: { id: true, status: true },
      }),
      tx.fnbProduct.findUnique({
        where: { id: input.productId },
        select: productSelect,
      }),
    ]);

    if (!booking) {
      throw new FnbError('Booking not found.', 404, 'BOOKING_NOT_FOUND');
    }
    if (booking.status === 'CANCELLED') {
      throw new FnbError(
        'Cannot add F&B items to a cancelled booking.',
        409,
        'BOOKING_CANCELLED',
      );
    }
    if (!product?.isActive) {
      throw new FnbError(
        'F&B item is unavailable.',
        404,
        'PRODUCT_UNAVAILABLE',
      );
    }

    return tx.bookingFnbItem.create({
      data: {
        bookingId,
        productId: product.id,
        productName: product.name,
        unitPrice: product.sellingPrice,
        quantity: input.quantity,
        subtotal: product.sellingPrice * input.quantity,
      },
      select: bookingItemSelect,
    });
  });
}

export async function removeBookingFnbItem(itemId: string, actorId: string) {
  return runSerializableTransaction(async (tx) => {
    const item = await tx.bookingFnbItem.findUnique({
      where: { id: itemId },
      select: bookingItemSelect,
    });
    if (!item) {
      throw new FnbError(
        'F&B booking item not found.',
        404,
        'BOOKING_ITEM_NOT_FOUND',
      );
    }
    if (item.status !== 'ACTIVE') return item;

    return tx.bookingFnbItem.update({
      where: { id: item.id },
      data: {
        status: 'VOID',
        voidedAt: new Date(),
        voidedById: actorId,
        voidReason: null,
      },
      select: bookingItemSelect,
    });
  });
}

export async function getFnbBookingItems(bookingId: string) {
  return prisma.bookingFnbItem.findMany({
    where: { bookingId },
    orderBy: { createdAt: 'desc' },
    select: bookingItemSelect,
  });
}
