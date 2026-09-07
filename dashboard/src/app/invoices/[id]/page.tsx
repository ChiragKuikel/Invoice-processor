"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { Invoice, AuditLog } from "@/lib/types";
import Link from "next/link";

export default function InvoiceDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;

  const [invoice, setInvoice] = useState<Invoice | null>(null);
  const [auditLog, setAuditLog] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);

  useEffect(() => {
    fetchData();
  }, [id]);

  async function fetchData() {
    const { data: inv } = await supabase
      .from("invoices")
      .select("*")
      .eq("id", id)
      .single();

    const { data: logs } = await supabase
      .from("audit_log")
      .select("*")
      .eq("invoice_id", id)
      .order("created_at", { ascending: true });

    setInvoice(inv);
    setAuditLog(logs || []);
    setLoading(false);
  }

  async function handleAction(status: "reviewed") {
    setActionLoading(true);
    const {
      data: { user },
    } = await supabase.auth.getUser();

    await supabase
      .from("invoices")
      .update({
        status,
        reviewed_by: user?.id,
        reviewed_at: new Date().toISOString(),
      })
      .eq("id", id);

    router.push("/");
    router.refresh();
  }

  if (loading) return <div className="p-8 text-gray-500">Loading...</div>;
  if (!invoice)
    return <div className="p-8 text-gray-500">Invoice not found.</div>;

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white shadow">
        <div className="max-w-5xl mx-auto px-4 py-4">
          <Link
            href="/"
            className="text-blue-600 hover:underline text-sm"
          >
            ← Back to list
          </Link>
          <h1 className="text-xl font-bold mt-2">
            {invoice.vendor_name || "Unknown Vendor"}
          </h1>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-6 space-y-6">
        {/* Status & Actions */}
        <div className="bg-white rounded-lg shadow p-6 flex items-center justify-between">
          <div>
            <span
              className={`px-3 py-1 rounded-full text-sm font-medium ${
                {
                  pending: "bg-yellow-100 text-yellow-800",
                  processing: "bg-blue-100 text-blue-800",
                  auto_approved: "bg-green-100 text-green-800",
                  flagged: "bg-red-100 text-red-800",
                  reviewed: "bg-purple-100 text-purple-800",
                  error: "bg-gray-100 text-gray-800",
                }[invoice.status] || "bg-gray-100"
              }`}
            >
              {invoice.status}
            </span>
            {invoice.flags?.length > 0 && (
              <div className="mt-2 flex gap-1 flex-wrap">
                {invoice.flags.map((f) => (
                  <span
                    key={f}
                    className="px-2 py-0.5 bg-red-50 text-red-700 rounded text-xs"
                  >
                    {f}
                  </span>
                ))}
              </div>
            )}
          </div>
          {invoice.status === "flagged" && (
            <div className="flex gap-2">
              <button
                onClick={() => handleAction("reviewed")}
                disabled={actionLoading}
                className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 disabled:opacity-50"
              >
                {actionLoading ? "Saving..." : "Approve"}
              </button>
            </div>
          )}
        </div>

        {/* Extracted Fields */}
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-lg font-semibold mb-4">Extracted Data</h2>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            <Field label="Vendor" value={invoice.vendor_name} />
            <Field label="Invoice #" value={invoice.invoice_number} />
            <Field label="Date" value={invoice.invoice_date} />
            <Field label="Currency" value={invoice.currency} />
            <Field
              label="Subtotal"
              value={
                invoice.subtotal != null
                  ? `$${invoice.subtotal.toFixed(2)}`
                  : null
              }
            />
            <Field
              label="Tax"
              value={
                invoice.tax != null ? `$${invoice.tax.toFixed(2)}` : null
              }
            />
            <Field
              label="Total"
              value={
                invoice.total != null
                  ? `$${invoice.total.toFixed(2)}`
                  : null
              }
            />
            <Field label="Category" value={invoice.category} />
            <Field
              label="Extraction Confidence"
              value={
                invoice.extraction_confidence != null
                  ? `${(invoice.extraction_confidence * 100).toFixed(0)}%`
                  : null
              }
            />
            <Field
              label="Recurring"
              value={
                invoice.is_recurring != null
                  ? invoice.is_recurring
                    ? "Yes"
                    : "No"
                  : null
              }
            />
          </div>
        </div>

        {/* Line Items */}
        {invoice.line_items && invoice.line_items.length > 0 && (
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-lg font-semibold mb-4">Line Items</h2>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className="text-left py-2">Description</th>
                  <th className="text-right py-2">Qty</th>
                  <th className="text-right py-2">Amount</th>
                </tr>
              </thead>
              <tbody>
                {invoice.line_items.map((item, i) => (
                  <tr key={i} className="border-b last:border-0">
                    <td className="py-2">{item.description}</td>
                    <td className="py-2 text-right">{item.quantity}</td>
                    <td className="py-2 text-right">
                      ${item.amount.toFixed(2)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Anomaly Note */}
        {invoice.anomaly_note && (
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
            <h3 className="font-medium text-yellow-800">Anomaly</h3>
            <p className="text-sm text-yellow-700 mt-1">
              {invoice.anomaly_note}
            </p>
          </div>
        )}

        {/* Audit Log */}
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-lg font-semibold mb-4">Audit Log</h2>
          {auditLog.length === 0 ? (
            <p className="text-gray-500 text-sm">No audit entries.</p>
          ) : (
            <div className="space-y-2">
              {auditLog.map((log) => (
                <div
                  key={log.id}
                  className="flex items-start gap-3 text-sm border-b border-gray-100 pb-2"
                >
                  <span className="text-gray-400 whitespace-nowrap">
                    {new Date(log.created_at).toLocaleString()}
                  </span>
                  <span className="font-medium text-gray-700">
                    {log.actor}
                  </span>
                  <span className="text-gray-600">
                    {log.from_status} → {log.to_status}
                  </span>
                  {log.reasoning && (
                    <span className="text-gray-500 italic">
                      — {log.reasoning}
                    </span>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Source File */}
        {invoice.source_file_url && (
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-lg font-semibold mb-2">Source File</h2>
            <a
              href={invoice.source_file_url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-600 hover:underline text-sm"
            >
              View original file →
            </a>
          </div>
        )}
      </main>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string | null }) {
  return (
    <div>
      <dt className="text-xs text-gray-500 uppercase">{label}</dt>
      <dd className="mt-1 text-sm text-gray-900">{value || "—"}</dd>
    </div>
  );
}
