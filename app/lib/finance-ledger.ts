type Row = Record<string, unknown>;
export type LedgerKind = "course" | "pass" | "membership";
export type FinanceData = {
  invoices?: Row[];
  payments?: Row[];
  passOrders?: Row[];
  passPayments?: Row[];
  students?: Row[];
  workflow?: {
    invoices?: Row[];
    membershipInvoices?: Row[];
    membershipPayments?: Row[];
    receipts?: Row[];
  };
};
export type LedgerInvoice = Row & {
  ledger_kind: LedgerKind;
  ledger_id: string;
  total_amount: number;
  paid_amount: number;
  balance: number;
};
export type LedgerPayment = Row & {
  ledger_kind: LedgerKind;
  ledger_id: string;
  amount: number;
};
const text = (value: unknown) => String(value ?? "");
const cents = (value: unknown) =>
  Number.isFinite(Number(value)) ? Math.round(Number(value) * 100) : 0;
const valid = (row: Row) =>
  !["cancelled", "canceled", "void", "voided"].includes(
    text(row.status).toLowerCase(),
  );
const sourceNames: Record<LedgerKind, string> = {
  course: "Course invoice",
  pass: "Course package",
  membership: "Membership",
};

/** All output amounts are RM; membership storage remains integer cents. */
export function buildFinanceLedger(data: FinanceData) {
  const students = new Map(
    (data.students || []).map((row) => [text(row.id), row]),
  );
  const groups: { kind: LedgerKind; invoices: Row[]; payments: Row[] }[] = [
    {
      kind: "course",
      invoices: data.invoices || [],
      payments: data.payments || [],
    },
    {
      kind: "pass",
      invoices: data.passOrders || [],
      payments: data.passPayments || [],
    },
    {
      kind: "membership",
      invoices:
        data.workflow?.membershipInvoices ?? data.workflow?.invoices ?? [],
      payments:
        data.workflow?.membershipPayments ?? data.workflow?.receipts ?? [],
    },
  ];
  const invoices: LedgerInvoice[] = [];
  const payments: LedgerPayment[] = [];
  for (const group of groups) {
    const parents = new Map(group.invoices.map((row) => [text(row.id), row]));
    const paidByInvoice = new Map<string, number>();
    for (const payment of group.payments) {
      const parentId = text(
        group.kind === "pass" ? payment.order_id : payment.invoice_id,
      );
      const parent = parents.get(parentId);
      if (!valid(payment) || (parent && !valid(parent))) continue;
      const paymentCents =
        group.kind === "membership"
          ? Math.round(Number(payment.amount_cents || 0))
          : cents(payment.amount);
      paidByInvoice.set(
        parentId,
        (paidByInvoice.get(parentId) || 0) + paymentCents,
      );
      const studentId = text(payment.student_id || parent?.student_id);
      payments.push({
        ...payment,
        ledger_id: `${group.kind}:${text(payment.id)}`,
        ledger_kind: group.kind,
        ledger_label: sourceNames[group.kind],
        student_id: studentId,
        student_name:
          payment.student_name ||
          parent?.student_name ||
          students.get(studentId)?.name ||
          "",
        course_title:
          payment.course_title ||
          parent?.course_title ||
          payment.product_name ||
          parent?.product_name ||
          sourceNames[group.kind],
        invoice_no: payment.invoice_no || parent?.invoice_no || parentId,
        amount: paymentCents / 100,
        proof_reference:
          payment.proof_reference ||
          payment.reference ||
          payment.receipt_no ||
          "",
        status:
          payment.status ||
          (payment.method === "fee_waiver" ? "fee_waiver" : "received"),
      });
    }
    for (const invoice of group.invoices) {
      if (!valid(invoice)) continue;
      const total =
        group.kind === "membership"
          ? Math.round(Number(invoice.amount_cents || 0))
          : cents(invoice.total_amount);
      const paid =
        group.kind === "membership"
          ? invoice.status === "paid"
            ? total
            : paidByInvoice.get(text(invoice.id)) || 0
          : cents(invoice.paid_amount);
      const studentId = text(invoice.student_id);
      invoices.push({
        ...invoice,
        ledger_id: `${group.kind}:${text(invoice.id)}`,
        ledger_kind: group.kind,
        ledger_label: sourceNames[group.kind],
        invoice_no: invoice.invoice_no || invoice.id,
        student_id: studentId,
        student_name:
          invoice.student_name || students.get(studentId)?.name || "",
        course_title:
          invoice.course_title ||
          invoice.product_name ||
          sourceNames[group.kind],
        issued_at: invoice.issued_at || invoice.created_at || "",
        total_amount: total / 100,
        paid_amount: paid / 100,
        balance: Math.max(0, total - paid) / 100,
      });
    }
  }
  invoices.sort(
    (a, b) =>
      b.balance - a.balance ||
      text(b.issued_at).localeCompare(text(a.issued_at)) ||
      a.ledger_id.localeCompare(b.ledger_id),
  );
  payments.sort(
    (a, b) =>
      text(b.received_at).localeCompare(text(a.received_at)) ||
      a.ledger_id.localeCompare(b.ledger_id),
  );
  return {
    invoices,
    payments,
    totals: {
      invoiced:
        invoices.reduce((sum, row) => sum + cents(row.total_amount), 0) / 100,
      received: payments.reduce((sum, row) => sum + cents(row.amount), 0) / 100,
      outstanding:
        invoices.reduce((sum, row) => sum + cents(row.balance), 0) / 100,
      paidInvoices: invoices.filter((row) => row.status === "paid").length,
    },
  };
}
