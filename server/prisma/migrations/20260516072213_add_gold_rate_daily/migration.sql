-- CreateTable
CREATE TABLE "GoldRateDaily" (
    "date" DATE NOT NULL,
    "fetchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "source" TEXT NOT NULL DEFAULT 'goldapi.io',
    "premiumBps" INTEGER NOT NULL,
    "rate24KPaise" INTEGER NOT NULL,
    "rate22KPaise" INTEGER NOT NULL,
    "rate18KPaise" INTEGER NOT NULL,
    "rate14KPaise" INTEGER NOT NULL,
    "silverPaise" INTEGER NOT NULL,

    CONSTRAINT "GoldRateDaily_pkey" PRIMARY KEY ("date")
);

-- CreateIndex
CREATE INDEX "GoldRateDaily_fetchedAt_idx" ON "GoldRateDaily"("fetchedAt");
