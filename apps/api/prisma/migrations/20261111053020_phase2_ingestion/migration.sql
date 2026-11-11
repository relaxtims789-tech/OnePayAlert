/*
  Warnings:

  - You are about to drop the column `webhook_secret_hash` on the `bank_connections` table. All the data in the column will be lost.

*/
-- CreateEnum
CREATE TYPE "WebhookEventSource" AS ENUM ('WEBHOOK', 'SIMULATOR');

-- CreateEnum
CREATE TYPE "WebhookEventStatus" AS ENUM ('RECEIVED', 'PROCESSED', 'IGNORED', 'FAILED');

-- AlterTable
ALTER TABLE "bank_connections" DROP COLUMN "webhook_secret_hash",
ADD COLUMN     "webhook_secret_ciphertext" TEXT;

-- AlterTable
ALTER TABLE "payment_providers" ADD COLUMN     "adapter_key" VARCHAR(40),
ADD COLUMN     "is_demo" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "transactions" ADD COLUMN     "is_simulated" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "webhook_events" (
    "id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "bank_connection_id" UUID NOT NULL,
    "provider_event_id" VARCHAR(128) NOT NULL,
    "source" "WebhookEventSource" NOT NULL,
    "status" "WebhookEventStatus" NOT NULL DEFAULT 'RECEIVED',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "last_error" VARCHAR(500),
    "payload" JSONB NOT NULL,
    "transaction_id" UUID,
    "received_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processed_at" TIMESTAMPTZ(6),

    CONSTRAINT "webhook_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "webhook_events_status_received_at_idx" ON "webhook_events"("status", "received_at");

-- CreateIndex
CREATE INDEX "webhook_events_company_id_received_at_idx" ON "webhook_events"("company_id", "received_at" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "webhook_events_bank_connection_id_provider_event_id_key" ON "webhook_events"("bank_connection_id", "provider_event_id");

-- AddForeignKey
ALTER TABLE "webhook_events" ADD CONSTRAINT "webhook_events_bank_connection_id_fkey" FOREIGN KEY ("bank_connection_id") REFERENCES "bank_connections"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Money integrity: amounts are non-negative integer minor units; direction carries the sign.
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_amount_minor_non_negative" CHECK ("amount_minor" >= 0);
ALTER TABLE "plans" ADD CONSTRAINT "plans_price_minor_non_negative" CHECK ("price_minor" >= 0);
ALTER TABLE "webhook_events" ADD CONSTRAINT "webhook_events_attempts_non_negative" CHECK ("attempts" >= 0);
