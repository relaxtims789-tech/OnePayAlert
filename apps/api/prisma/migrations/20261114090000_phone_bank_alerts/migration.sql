-- CreateEnum
CREATE TYPE "TransactionVerification" AS ENUM ('VERIFIED', 'REPORTED');

-- AlterEnum
ALTER TYPE "WebhookEventSource" ADD VALUE 'RELAY';

-- AlterTable
ALTER TABLE "devices" ADD COLUMN     "announce_reported" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable
ALTER TABLE "transactions" ADD COLUMN     "verification" "TransactionVerification" NOT NULL DEFAULT 'VERIFIED';

-- CreateTable
CREATE TABLE "relay_phones" (
    "id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "bank_connection_id" UUID NOT NULL,
    "name" VARCHAR(80) NOT NULL,
    "secret_ciphertext" TEXT NOT NULL,
    "created_by_id" UUID,
    "last_seen_at" TIMESTAMPTZ(6),
    "last_payment_at" TIMESTAMPTZ(6),
    "revoked_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "relay_phones_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "relay_phones_company_id_idx" ON "relay_phones"("company_id");

-- CreateIndex
CREATE INDEX "relay_phones_bank_connection_id_idx" ON "relay_phones"("bank_connection_id");

-- AddForeignKey
ALTER TABLE "relay_phones" ADD CONSTRAINT "relay_phones_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "relay_phones" ADD CONSTRAINT "relay_phones_bank_connection_id_fkey" FOREIGN KEY ("bank_connection_id") REFERENCES "bank_connections"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Row-level security: phones belong to one company, like every other tenant table.
ALTER TABLE "relay_phones" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "relay_phones" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "relay_phones"
  USING (NULLIF(current_setting('onepay.company_id', true), '') IS NULL OR company_id = NULLIF(current_setting('onepay.company_id', true), '')::uuid)
  WITH CHECK (NULLIF(current_setting('onepay.company_id', true), '') IS NULL OR company_id = NULLIF(current_setting('onepay.company_id', true), '')::uuid);
