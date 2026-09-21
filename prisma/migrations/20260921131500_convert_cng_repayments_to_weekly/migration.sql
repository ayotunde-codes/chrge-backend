-- Repayment amounts are stored in the existing physical column for a
-- backwards-compatible rollout, but the application now treats the value as
-- the quoted weekly payment.
UPDATE "cng_applications"
SET "monthlyPaymentNgn" = ROUND(
  (COALESCE("financedAmountNgn", 0) + COALESCE("interestAmountNgn", 0))::numeric
  / GREATEST(1, ROUND("preferredLoanTenor" * 52.0 / 12.0))
)::integer
WHERE "preferredLoanTenor" IS NOT NULL
  AND "preferredLoanTenor" > 0
  AND "financedAmountNgn" IS NOT NULL;

-- Safely replace schedules that have not received any payment. Applications
-- with paid installments are left untouched so historical transactions are
-- never rewritten automatically.
CREATE TEMP TABLE "_cng_weekly_schedule_apps" ON COMMIT DROP AS
SELECT
  application."id",
  application."financeDisbursedAt" AS "startsAt",
  COALESCE(application."financedAmountNgn", 0)
    + COALESCE(application."interestAmountNgn", 0) AS "repaymentTotal",
  application."monthlyPaymentNgn" AS "weeklyPayment",
  GREATEST(1, ROUND(application."preferredLoanTenor" * 52.0 / 12.0))::integer AS "installmentCount"
FROM "cng_applications" application
WHERE application."preferredLoanTenor" IS NOT NULL
  AND application."preferredLoanTenor" > 0
  AND application."financeDisbursedAt" IS NOT NULL
  AND application."monthlyPaymentNgn" IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM "cng_installments" installment
    WHERE installment."applicationId" = application."id"
      AND installment."status" = 'PAID'
  );

DELETE FROM "cng_installments"
WHERE "applicationId" IN (SELECT "id" FROM "_cng_weekly_schedule_apps");

INSERT INTO "cng_installments" (
  "id",
  "applicationId",
  "number",
  "amountNgn",
  "dueAt",
  "status",
  "createdAt",
  "updatedAt"
)
SELECT
  gen_random_uuid()::text,
  application."id",
  installment.number,
  CASE
    WHEN installment.number = application."installmentCount"
      THEN application."repaymentTotal"
        - application."weeklyPayment" * (application."installmentCount" - 1)
    ELSE application."weeklyPayment"
  END,
  application."startsAt" + installment.number * INTERVAL '7 days',
  'PENDING'::"CngInstallmentStatus",
  NOW(),
  NOW()
FROM "_cng_weekly_schedule_apps" application
CROSS JOIN LATERAL generate_series(1, application."installmentCount") AS installment(number);
