-- Soundbox devices (Phase 7). No device rows existed before this phase, so the new required
-- secret/claim-code columns need no backfill.

-- AlterEnum
BEGIN;
CREATE TYPE "DeviceStatus_new" AS ENUM ('UNASSIGNED', 'ACTIVE', 'DISABLED');
ALTER TABLE "public"."devices" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "devices" ALTER COLUMN "status" TYPE "DeviceStatus_new" USING ("status"::text::"DeviceStatus_new");
ALTER TYPE "DeviceStatus" RENAME TO "DeviceStatus_old";
ALTER TYPE "DeviceStatus_new" RENAME TO "DeviceStatus";
DROP TYPE "public"."DeviceStatus_old";
ALTER TABLE "devices" ALTER COLUMN "status" SET DEFAULT 'UNASSIGNED';
COMMIT;

-- DropIndex
DROP INDEX "devices_mqtt_client_id_key";

-- AlterTable
ALTER TABLE "devices" DROP COLUMN "mqtt_client_id",
ADD COLUMN     "battery_pct" INTEGER,
ADD COLUMN     "claim_code_hash" TEXT NOT NULL,
ADD COLUMN     "claimed_at" TIMESTAMPTZ(6),
ADD COLUMN     "locale" "Locale" NOT NULL DEFAULT 'km',
ADD COLUMN     "name" VARCHAR(80),
ADD COLUMN     "online" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "secret_hash" TEXT NOT NULL,
ADD COLUMN     "signal_dbm" INTEGER;

-- CreateIndex
CREATE INDEX "devices_company_id_outlet_id_idx" ON "devices"("company_id", "outlet_id");

