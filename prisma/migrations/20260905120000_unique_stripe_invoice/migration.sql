-- One history entry per Stripe invoice (defense-in-depth against duplicate
-- at-least-once deliveries). Postgres unique indexes permit multiple NULLs, so
-- rows without an invoice link are unaffected.
CREATE UNIQUE INDEX "BillingHistory_stripeInvoiceId_key" ON "BillingHistory"("stripeInvoiceId");
