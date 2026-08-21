CREATE TABLE "fnb_products" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "sku" TEXT,
    "sellingPrice" INTEGER NOT NULL,
    "costPrice" INTEGER,
    "currentStock" INTEGER NOT NULL DEFAULT 0,
    "lowStockThreshold" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "fnb_products_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "booking_fnb_items" (
    "id" TEXT NOT NULL,
    "bookingId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "productName" TEXT NOT NULL,
    "unitPrice" INTEGER NOT NULL,
    "quantity" INTEGER NOT NULL,
    "subtotal" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "voidedAt" TIMESTAMP(3),
    "voidedById" TEXT,
    "voidReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "booking_fnb_items_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "fnb_stock_movements" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "bookingFnbItemId" TEXT,
    "actorId" TEXT,
    "type" TEXT NOT NULL,
    "quantityChange" INTEGER NOT NULL,
    "unitCost" INTEGER,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "fnb_stock_movements_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "fnb_products"
ADD CONSTRAINT "fnb_products_prices_and_stock_nonnegative"
CHECK (
  "sellingPrice" >= 0
  AND ("costPrice" IS NULL OR "costPrice" >= 0)
  AND "currentStock" >= 0
  AND "lowStockThreshold" >= 0
);

ALTER TABLE "booking_fnb_items"
ADD CONSTRAINT "booking_fnb_items_amounts_positive"
CHECK ("unitPrice" >= 0 AND "quantity" > 0 AND "subtotal" >= 0);

ALTER TABLE "fnb_stock_movements"
ADD CONSTRAINT "fnb_stock_movements_quantity_nonzero"
CHECK ("quantityChange" <> 0);

CREATE UNIQUE INDEX "fnb_products_sku_key" ON "fnb_products"("sku");
CREATE INDEX "fnb_products_isActive_category_idx" ON "fnb_products"("isActive", "category");
CREATE INDEX "fnb_products_currentStock_idx" ON "fnb_products"("currentStock");
CREATE INDEX "booking_fnb_items_bookingId_createdAt_idx" ON "booking_fnb_items"("bookingId", "createdAt");
CREATE INDEX "booking_fnb_items_productId_status_idx" ON "booking_fnb_items"("productId", "status");
CREATE INDEX "booking_fnb_items_status_createdAt_idx" ON "booking_fnb_items"("status", "createdAt");
CREATE INDEX "fnb_stock_movements_productId_createdAt_idx" ON "fnb_stock_movements"("productId", "createdAt");
CREATE INDEX "fnb_stock_movements_bookingFnbItemId_idx" ON "fnb_stock_movements"("bookingFnbItemId");
CREATE INDEX "fnb_stock_movements_type_createdAt_idx" ON "fnb_stock_movements"("type", "createdAt");

ALTER TABLE "booking_fnb_items"
ADD CONSTRAINT "booking_fnb_items_bookingId_fkey"
FOREIGN KEY ("bookingId") REFERENCES "bookings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "booking_fnb_items"
ADD CONSTRAINT "booking_fnb_items_productId_fkey"
FOREIGN KEY ("productId") REFERENCES "fnb_products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "booking_fnb_items"
ADD CONSTRAINT "booking_fnb_items_voidedById_fkey"
FOREIGN KEY ("voidedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "fnb_stock_movements"
ADD CONSTRAINT "fnb_stock_movements_productId_fkey"
FOREIGN KEY ("productId") REFERENCES "fnb_products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "fnb_stock_movements"
ADD CONSTRAINT "fnb_stock_movements_bookingFnbItemId_fkey"
FOREIGN KEY ("bookingFnbItemId") REFERENCES "booking_fnb_items"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "fnb_stock_movements"
ADD CONSTRAINT "fnb_stock_movements_actorId_fkey"
FOREIGN KEY ("actorId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
