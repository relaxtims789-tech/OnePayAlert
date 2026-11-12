-- Row-level security: a second line of tenant isolation under the API's own company_id filters.
--
-- A request acting for one merchant runs its queries in a transaction that sets
--   SELECT set_config('onepay.company_id', '<company uuid>', true);
-- and then sees, and may write, only that company's rows. Work without a company context
-- (payment ingestion, billing job, MysoftKH admin, sign-in) sets nothing and is unaffected.
--
-- PostgreSQL superusers bypass RLS. Production and the test suite therefore connect as a normal
-- role (see infra/postgres/app-role.sql); FORCE also applies the policies to the table owner.

ALTER TABLE "audit_logs" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "audit_logs" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "audit_logs"
  USING (NULLIF(current_setting('onepay.company_id', true), '') IS NULL OR company_id = NULLIF(current_setting('onepay.company_id', true), '')::uuid)
  WITH CHECK (NULLIF(current_setting('onepay.company_id', true), '') IS NULL OR company_id = NULLIF(current_setting('onepay.company_id', true), '')::uuid);

ALTER TABLE "bank_connections" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "bank_connections" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "bank_connections"
  USING (NULLIF(current_setting('onepay.company_id', true), '') IS NULL OR company_id = NULLIF(current_setting('onepay.company_id', true), '')::uuid)
  WITH CHECK (NULLIF(current_setting('onepay.company_id', true), '') IS NULL OR company_id = NULLIF(current_setting('onepay.company_id', true), '')::uuid);

ALTER TABLE "devices" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "devices" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "devices"
  USING (NULLIF(current_setting('onepay.company_id', true), '') IS NULL OR company_id = NULLIF(current_setting('onepay.company_id', true), '')::uuid)
  WITH CHECK (NULLIF(current_setting('onepay.company_id', true), '') IS NULL OR company_id = NULLIF(current_setting('onepay.company_id', true), '')::uuid);

ALTER TABLE "invoices" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "invoices" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "invoices"
  USING (NULLIF(current_setting('onepay.company_id', true), '') IS NULL OR company_id = NULLIF(current_setting('onepay.company_id', true), '')::uuid)
  WITH CHECK (NULLIF(current_setting('onepay.company_id', true), '') IS NULL OR company_id = NULLIF(current_setting('onepay.company_id', true), '')::uuid);

ALTER TABLE "membership_outlets" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "membership_outlets" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "membership_outlets"
  USING (NULLIF(current_setting('onepay.company_id', true), '') IS NULL OR company_id = NULLIF(current_setting('onepay.company_id', true), '')::uuid)
  WITH CHECK (NULLIF(current_setting('onepay.company_id', true), '') IS NULL OR company_id = NULLIF(current_setting('onepay.company_id', true), '')::uuid);

ALTER TABLE "memberships" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "memberships" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "memberships"
  USING (NULLIF(current_setting('onepay.company_id', true), '') IS NULL OR company_id = NULLIF(current_setting('onepay.company_id', true), '')::uuid)
  WITH CHECK (NULLIF(current_setting('onepay.company_id', true), '') IS NULL OR company_id = NULLIF(current_setting('onepay.company_id', true), '')::uuid);

ALTER TABLE "outlets" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "outlets" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "outlets"
  USING (NULLIF(current_setting('onepay.company_id', true), '') IS NULL OR company_id = NULLIF(current_setting('onepay.company_id', true), '')::uuid)
  WITH CHECK (NULLIF(current_setting('onepay.company_id', true), '') IS NULL OR company_id = NULLIF(current_setting('onepay.company_id', true), '')::uuid);

ALTER TABLE "subscriptions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "subscriptions" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "subscriptions"
  USING (NULLIF(current_setting('onepay.company_id', true), '') IS NULL OR company_id = NULLIF(current_setting('onepay.company_id', true), '')::uuid)
  WITH CHECK (NULLIF(current_setting('onepay.company_id', true), '') IS NULL OR company_id = NULLIF(current_setting('onepay.company_id', true), '')::uuid);

ALTER TABLE "transactions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "transactions" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "transactions"
  USING (NULLIF(current_setting('onepay.company_id', true), '') IS NULL OR company_id = NULLIF(current_setting('onepay.company_id', true), '')::uuid)
  WITH CHECK (NULLIF(current_setting('onepay.company_id', true), '') IS NULL OR company_id = NULLIF(current_setting('onepay.company_id', true), '')::uuid);

ALTER TABLE "webhook_events" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "webhook_events" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "webhook_events"
  USING (NULLIF(current_setting('onepay.company_id', true), '') IS NULL OR company_id = NULLIF(current_setting('onepay.company_id', true), '')::uuid)
  WITH CHECK (NULLIF(current_setting('onepay.company_id', true), '') IS NULL OR company_id = NULLIF(current_setting('onepay.company_id', true), '')::uuid);

ALTER TABLE "companies" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "companies" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "companies"
  USING (NULLIF(current_setting('onepay.company_id', true), '') IS NULL OR id = NULLIF(current_setting('onepay.company_id', true), '')::uuid)
  WITH CHECK (NULLIF(current_setting('onepay.company_id', true), '') IS NULL OR id = NULLIF(current_setting('onepay.company_id', true), '')::uuid);
