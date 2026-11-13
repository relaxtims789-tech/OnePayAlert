-- Bakong KHQR collection: payment requests (charges), the POLLER event source, and the
-- non-secret provider account id on bank connections.

-- CreateEnum
CREATE TYPE "KhqrChargeStatus" AS ENUM ('PENDING', 'PAID', 'EXPIRED', 'CANCELED', 'REVIEW');

-- AlterEnum
ALTER TYPE "WebhookEventSource" ADD VALUE 'POLLER';

-- AlterTable
ALTER TABLE "bank_connections" ADD COLUMN     "external_account_id" VARCHAR(64);

-- CreateTable
CREATE TABLE "khqr_charges" (
    "id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "bank_connection_id" UUID NOT NULL,
    "outlet_id" UUID,
    "created_by_id" UUID,
    "reference" VARCHAR(25) NOT NULL,
    "amount_minor" BIGINT NOT NULL,
    "currency" "Currency" NOT NULL,
    "qr" TEXT NOT NULL,
    "md5" CHAR(32) NOT NULL,
    "status" "KhqrChargeStatus" NOT NULL DEFAULT 'PENDING',
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "paid_at" TIMESTAMPTZ(6),
    "provider_txn_id" VARCHAR(128),
    "payer_account" VARCHAR(64),
    "review_reason" VARCHAR(300),
    "simulated" BOOLEAN NOT NULL DEFAULT false,
    "last_checked_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "khqr_charges_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "khqr_charges_md5_key" ON "khqr_charges"("md5");

-- CreateIndex
CREATE INDEX "khqr_charges_status_expires_at_idx" ON "khqr_charges"("status", "expires_at");

-- CreateIndex
CREATE INDEX "khqr_charges_company_id_created_at_idx" ON "khqr_charges"("company_id", "created_at" DESC);

-- AddForeignKey
ALTER TABLE "khqr_charges" ADD CONSTRAINT "khqr_charges_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "khqr_charges" ADD CONSTRAINT "khqr_charges_bank_connection_id_fkey" FOREIGN KEY ("bank_connection_id") REFERENCES "bank_connections"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "khqr_charges" ADD CONSTRAINT "khqr_charges_outlet_id_fkey" FOREIGN KEY ("outlet_id") REFERENCES "outlets"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- Row-level security, like every other tenant table (see 20261112150000_phase8_rls).
ALTER TABLE "khqr_charges" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "khqr_charges" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "khqr_charges"
  USING (NULLIF(current_setting('onepay.company_id', true), '') IS NULL OR company_id = NULLIF(current_setting('onepay.company_id', true), '')::uuid)
  WITH CHECK (NULLIF(current_setting('onepay.company_id', true), '') IS NULL OR company_id = NULLIF(current_setting('onepay.company_id', true), '')::uuid);
