import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import ts from "typescript";

const source = readFileSync(
  new URL("../app/lib/finance-ledger.ts", import.meta.url),
  "utf8",
);
const code = ts.transpileModule(source, {
  compilerOptions: {
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.ES2022,
  },
}).outputText;
const { buildFinanceLedger } = await import(
  `data:text/javascript;base64,${Buffer.from(code).toString("base64")}`
);

test("finance combines course, package and membership receipts without changing cents to RM twice", () => {
  const result = buildFinanceLedger({
    students: [{ id: "s", name: "Student A" }],
    invoices: [
      {
        id: "shared",
        student_id: "s",
        total_amount: 100,
        paid_amount: 30,
        status: "partly_paid",
      },
    ],
    payments: [
      { id: "p", invoice_id: "shared", amount: 30, received_at: "2026-10-20" },
    ],
    passOrders: [
      {
        id: "shared",
        student_id: "s",
        total_amount: 160,
        paid_amount: 160,
        status: "paid",
        product_name: "462 package",
      },
    ],
    passPayments: [
      { id: "p", order_id: "shared", amount: 160, received_at: "2026-10-21" },
    ],
    workflow: {
      invoices: [
        { id: "shared", student_id: "s", amount_cents: 2550, status: "paid" },
      ],
      membershipPayments: [
        {
          id: "p",
          invoice_id: "shared",
          amount_cents: 2550,
          reference: "BANK-42",
          received_at: "2026-10-22",
        },
      ],
    },
  });
  assert.deepEqual(result.totals, {
    invoiced: 285.5,
    received: 215.5,
    outstanding: 70,
    paidInvoices: 2,
  });
  assert.equal(new Set(result.invoices.map((row) => row.ledger_id)).size, 3);
  assert.equal(new Set(result.payments.map((row) => row.ledger_id)).size, 3);
  assert.equal(result.payments[0].amount, 25.5);
  assert.equal(result.payments[0].proof_reference, "BANK-42");
  assert.equal(result.payments[1].student_name, "Student A");
});

test("void/cancelled bills and receipts are excluded, and overpayment cannot hide another learner balance", () => {
  const result = buildFinanceLedger({
    invoices: [
      { id: "a", total_amount: 10, paid_amount: 12, status: "paid" },
      { id: "b", total_amount: 20, paid_amount: 0, status: "unpaid" },
      {
        id: "cancelled",
        total_amount: 99,
        paid_amount: 99,
        status: "cancelled",
      },
    ],
    payments: [
      { id: "a-pay", invoice_id: "a", amount: 12 },
      { id: "void-pay", invoice_id: "b", amount: 20, status: "void" },
      { id: "cancel-pay", invoice_id: "cancelled", amount: 99 },
    ],
    workflow: { invoices: [{ id: "zero", amount_cents: 0, status: "unpaid" }] },
  });
  assert.deepEqual(result.totals, {
    invoiced: 30,
    received: 12,
    outstanding: 20,
    paidInvoices: 1,
  });
  assert.equal(
    result.invoices.find((row) => row.id === "zero").status,
    "unpaid",
  );
  assert.equal(result.payments.length, 1);
});

test("ledger uses recorded receipts rather than inventing payments from a paid flag", () => {
  const result = buildFinanceLedger({
    workflow: {
      invoices: [{ id: "m", amount_cents: 1000, status: "paid" }],
      membershipInvoices: [{ id: "m", amount_cents: 1000, status: "paid" }],
      membershipPayments: [],
    },
  });
  assert.equal(result.invoices.length, 1);
  assert.equal(result.totals.invoiced, 10);
  assert.equal(result.totals.received, 0);
  assert.equal(result.totals.outstanding, 0);
  assert.equal(result.payments.length, 0);
});
