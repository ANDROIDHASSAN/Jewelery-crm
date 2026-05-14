-- CreateTable
CREATE TABLE "StorefrontContent" (
    "tenantId" TEXT NOT NULL,
    "content" JSONB NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedBy" TEXT,

    CONSTRAINT "StorefrontContent_pkey" PRIMARY KEY ("tenantId")
);

-- AddForeignKey
ALTER TABLE "StorefrontContent" ADD CONSTRAINT "StorefrontContent_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
