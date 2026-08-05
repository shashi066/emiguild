CREATE TABLE "website_analytics" (
    "date" TIMESTAMP(3) NOT NULL,
    "userKey" TEXT NOT NULL,
    "visits" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "website_analytics_pkey" PRIMARY KEY ("date", "userKey")
);
