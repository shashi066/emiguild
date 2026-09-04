DROP TABLE "fnb_stock_movements";

DROP INDEX "fnb_products_sku_key";
DROP INDEX "fnb_products_isActive_category_idx";
DROP INDEX "fnb_products_currentStock_idx";

ALTER TABLE "fnb_products"
DROP CONSTRAINT "fnb_products_prices_and_stock_nonnegative";

ALTER TABLE "fnb_products"
DROP COLUMN "category",
DROP COLUMN "sku",
DROP COLUMN "costPrice",
DROP COLUMN "currentStock",
DROP COLUMN "lowStockThreshold";

ALTER TABLE "fnb_products"
ADD CONSTRAINT "fnb_products_selling_price_nonnegative"
CHECK ("sellingPrice" >= 0);

CREATE INDEX "fnb_products_isActive_sellingPrice_idx"
ON "fnb_products"("isActive", "sellingPrice");
