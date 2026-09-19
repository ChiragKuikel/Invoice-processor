"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { Invoice, AuditLog } from "@/lib/types";
import Link from "next/link";
import {
  ChevronLeft,
  CheckCircle2,
  XCircle,
  FileText,
  ExternalLink,
  Download,
  Inbox,
  FileSearch,
  ShieldCheck,
  BadgeCheck,
} from "lucide-react";
import {
  StageBadge,
  QuickBooksBadge,
  ConfidencePair,
  ChecksRing,
  getAutomationChecks,
} from "@/components/badges";

const TABS = ["Invoice details", "Extracted data", "QuickBooks"] as const;
type Tab = (typeof TABS)[number];

const QB_ENV = process.env.NEXT_PUBLIC_QUICKBOOKS_ENV ?? "sandbox";
const QB_REALM_ID = process.env.NEXT_PUBLIC_QUICKBOOKS_REALM_ID;

function quickbooksBillUrl(billId: string): string | null {
  if (!QB_REALM_ID) return null;
  const host = QB_ENV === "production" ? "qbo.intuit.com" : "sandbox.qbo.intuit.com";
  return `https://${host}/app/bill?txnId=${billId}`;
}

// invoices is a private storage bucket (001_tables.sql) — the raw
// source_file_url stored on the row is an unsigned object URL and 400s for
// everyone, dashboard included. Signing it client-side with the
// authenticated session (which storage.objects RLS already grants read to)
// is the actual fix, not something to route around.
function storageObjectPath(sourceFileUrl: string): string | null {
  const marker = "/object/invoices/";
  const i = sourceFileUrl.indexOf(marker);
  return i === -1 ? null : sourceFileUrl.slice(i + marker.length);
}

export default function InvoiceDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;

  const [invoice, setInvoice] = useState<Invoice | null>(null);
  const [auditLog, setAuditLog] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [tab, setTab] = useState<Tab>("Invoice details");
  const [fileUrl, setFileUrl] = useState<string | null>(null);
  const [fileSize, setFileSize] = useState<string | null>(null);
  const [notesDraft, setNotesDraft] = useState("");
  const [savingNotes, setSavingNotes] = useState(false);

  async function fetchData() {
    const { data: inv } = await supabase
      .from("invoices")
      .select("*, invoice_pipeline_stage, invoice_review_reason, invoice_quickbooks_status")
      .eq("id", id)
      .single();

    const { data: logs } = await supabase
      .from("audit_log")
      .select("*")
      .eq("invoice_id", id)
      .order("created_at", { ascending: true });

    setInvoice(inv);
    setNotesDraft(inv?.notes || "");
    setAuditLog(logs || []);
    setLoading(false);

    const objectPath = inv?.source_file_url ? storageObjectPath(inv.source_file_url) : null;
    if (objectPath) {
      const { data: signed } = await supabase.storage
        .from("invoices")
        .createSignedUrl(objectPath, 3600);
      if (signed?.signedUrl) {
        setFileUrl(signed.signedUrl);
        fetch(signed.signedUrl, { method: "HEAD" })
          .then((res) => {
            const len = res.headers.get("content-length");
            if (res.ok && len) setFileSize(`${(Number(len) / 1024).toFixed(0)} KB`);
          })
          .catch(() => {});
      }
    }
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  async function handleAction(status: "reviewed") {
    setActionLoading(true);
    const {
      data: { user },
    } = await supabase.auth.getUser();

    await supabase
      .from("invoices")
      .update({ status, reviewed_by: user?.id, reviewed_at: new Date().toISOString() })
      .eq("id", id);

    router.push("/");
    router.refresh();
  }

  async function handleSaveNotes() {
    setSavingNotes(true);
    await supabase.from("invoices").update({ notes: notesDraft || null }).eq("id", id);
    setSavingNotes(false);
  }

  if (loading) return <div className="p-8 text-gray-500 text-sm">Loading...</div>;
  if (!invoice) return <div className="p-8 text-gray-500 text-sm">Invoice not found.</div>;

  const checks = getAutomationChecks(invoice);
  const passed = checks.filter((c) => c.passed).length;

  const stageLabel =
    invoice.status === "auto_approved"
      ? "Auto-approved"
      : invoice.status === "reviewed"
      ? "Approved on review"
      : invoice.status === "flagged"
      ? "Needs review"
      : invoice.status === "error"
      ? "Failed"
      : "In progress";

  // Only real timestamps. A step with no timestamp is omitted rather than
  // shown with a fabricated time. "Approved" reuses reviewed_at (manual) or
  // validated_at (the same Postgres update that set status=auto_approved).
  const steps: { label: string; icon: typeof Inbox; at: string | null }[] = [
    { label: "Received", icon: Inbox, at: invoice.created_at },
    { label: "Extracted", icon: FileSearch, at: invoice.extracted_at },
    { label: "Validated", icon: ShieldCheck, at: invoice.validated_at },
    {
      label: "Approved",
      icon: CheckCircle2,
      at: invoice.reviewed_at ?? (invoice.status === "auto_approved" ? invoice.validated_at : null),
    },
    { label: "Synced", icon: BadgeCheck, at: invoice.qb_synced_at },
  ].filter((s) => s.at);

  const qbUrl = invoice.qb_bill_id ? quickbooksBillUrl(invoice.qb_bill_id) : null;
  const fileName = invoice.source_file_url?.split("/").pop() || null;

  return (
    <div className="max-w-[1200px] mx-auto px-6 py-6">
      <Link href="/" className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700">
        <ChevronLeft className="w-4 h-4" />
        Back to invoices
      </Link>

      <div className="flex items-start justify-between mt-3 mb-1 gap-4 flex-wrap">
        <div className="flex items-center gap-3 flex-wrap">
          <h1 className="text-2xl font-semibold text-gray-900">{invoice.invoice_number || "No invoice #"}</h1>
          <StageBadge stage={invoice.invoice_pipeline_stage} />
        </div>
        <div className="flex items-center gap-2">
          {invoice.status === "flagged" && (
            <button
              onClick={() => handleAction("reviewed")}
              disabled={actionLoading}
              className="px-4 py-2 bg-emerald-600 text-white text-sm font-medium rounded-lg hover:bg-emerald-700 disabled:opacity-50"
            >
              {actionLoading ? "Saving..." : "Approve"}
            </button>
          )}
          {fileUrl && (
            <a
              href={fileUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 px-3.5 py-2 border border-gray-200 rounded-lg text-sm font-medium text-gray-600 hover:bg-gray-50"
            >
              <Download className="w-4 h-4" />
              Download
            </a>
          )}
        </div>
      </div>
      <p className="text-sm text-gray-500 mb-5">
        {invoice.vendor_name || "Unknown vendor"}
        {invoice.total != null && ` · ${invoice.currency || ""} ${invoice.total.toFixed(2)}`}
        {` · Received ${new Date(invoice.created_at).toLocaleString(undefined, {
          month: "short",
          day: "numeric",
          year: "numeric",
          hour: "numeric",
          minute: "2-digit",
        })}`}
      </p>

      {/* Stepper — only real, timestamped steps */}
      {steps.length > 1 && (
        <div className="bg-white rounded-xl border border-gray-200 p-5 mb-5 flex items-center gap-2 overflow-x-auto">
          {steps.map((s, i) => {
            const Icon = s.icon;
            return (
              <div key={s.label} className="flex items-center gap-2 shrink-0">
                {i > 0 && <div className="w-8 h-px bg-gray-200 shrink-0" />}
                <div className="flex flex-col items-center gap-1 min-w-[92px]">
                  <div className="w-8 h-8 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center">
                    <Icon className="w-4 h-4" />
                  </div>
                  <p className="text-xs font-medium text-gray-700">{s.label}</p>
                  <p className="text-[11px] text-gray-400 whitespace-nowrap">
                    {new Date(s.at!).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        <div className="md:col-span-2">
          {/* Tabs */}
          <div className="flex items-center gap-1 mb-4 border-b border-gray-200">
            {TABS.map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`px-3.5 py-2.5 text-sm font-medium border-b-2 -mb-px transition ${
                  tab === t ? "border-blue-600 text-blue-600" : "border-transparent text-gray-500 hover:text-gray-700"
                }`}
              >
                {t}
              </button>
            ))}
          </div>

          {tab === "Invoice details" && (
            <div className="bg-white rounded-xl border border-gray-200 p-5">
              {invoice.source_file_url && fileUrl ? (
                <>
                  <iframe
                    src={`${fileUrl}#toolbar=1&navpanes=0`}
                    className="w-full h-[600px] rounded-lg border border-gray-100"
                  />
                  <div className="flex items-center gap-4 mt-3">
                    <a href={fileUrl} target="_blank" rel="noopener noreferrer" className="text-sm text-blue-600 hover:text-blue-700">
                      View full size ↗
                    </a>
                  </div>
                </>
              ) : invoice.source_file_url ? (
                <p className="text-gray-500 text-sm">Loading preview...</p>
              ) : (
                <p className="text-gray-500 text-sm">No source file on record for this invoice.</p>
              )}
            </div>
          )}

          {tab === "Extracted data" && (
            <div className="bg-white rounded-xl border border-gray-200 p-5">
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-5">
                <Field label="Vendor" value={invoice.vendor_name} />
                <Field label="Invoice #" value={invoice.invoice_number} />
                <Field label="Date" value={invoice.invoice_date} />
                <Field label="Currency" value={invoice.currency} />
                <Field label="Subtotal" value={invoice.subtotal != null ? `$${invoice.subtotal.toFixed(2)}` : null} />
                <Field label="Tax" value={invoice.tax != null ? `$${invoice.tax.toFixed(2)}` : null} />
                <Field label="Total" value={invoice.total != null ? `$${invoice.total.toFixed(2)}` : null} />
                <Field label="Category" value={invoice.category} />
                <Field label="Recurring" value={invoice.is_recurring != null ? (invoice.is_recurring ? "Yes" : "No") : null} />
              </div>

              {invoice.line_items && invoice.line_items.length > 0 && (
                <>
                  <h3 className="text-sm font-semibold text-gray-900 mb-3 pt-3 border-t border-gray-100">Line items</h3>
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-gray-100 text-left text-xs font-medium text-gray-400 uppercase">
                        <th className="py-2">Description</th>
                        <th className="py-2 text-right">Qty</th>
                        <th className="py-2 text-right">Amount</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {invoice.line_items.map((item, i) => (
                        <tr key={i}>
                          <td className="py-2 text-gray-700">{item.description}</td>
                          <td className="py-2 text-right text-gray-700">{item.quantity}</td>
                          <td className="py-2 text-right text-gray-700 tabular-nums">${item.amount.toFixed(2)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </>
              )}

              {invoice.anomaly_note && (
                <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 mt-4">
                  <h3 className="text-sm font-medium text-amber-800">Anomaly</h3>
                  <p className="text-sm text-amber-700 mt-1">{invoice.anomaly_note}</p>
                </div>
              )}
            </div>
          )}

          {tab === "QuickBooks" && (
            <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-5">
              <div>
                <h3 className="text-sm font-semibold text-gray-900 mb-3">QuickBooks</h3>
                <div className="flex items-center gap-3">
                  <QuickBooksBadge status={invoice.invoice_quickbooks_status} />
                  {invoice.qb_bill_id && <span className="text-sm text-gray-500">Bill #{invoice.qb_bill_id}</span>}
                </div>
                {invoice.qb_synced_at && (
                  <p className="text-xs text-gray-400 mt-1">
                    Synced {new Date(invoice.qb_synced_at).toLocaleString()}
                  </p>
                )}
                {qbUrl && (
                  <a
                    href={qbUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-sm text-blue-600 hover:text-blue-700 mt-2"
                  >
                    View in QuickBooks <ExternalLink className="w-3 h-3" />
                  </a>
                )}
              </div>

              <div className="pt-4 border-t border-gray-100">
                <h3 className="text-sm font-semibold text-gray-900 mb-3">Google Sheets</h3>
                {invoice.sheet_exported_at ? (
                  <p className="text-sm text-gray-500">
                    Exported {new Date(invoice.sheet_exported_at).toLocaleString()}
                  </p>
                ) : (
                  <p className="text-sm text-gray-400">Not exported yet.</p>
                )}
              </div>

              {invoice.vendor_name && (
                <div className="pt-4 border-t border-gray-100">
                  <h3 className="text-sm font-semibold text-gray-900 mb-3">Vendor</h3>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-gray-700">{invoice.vendor_name}</span>
                    <Link
                      href={`/vendors?q=${encodeURIComponent(invoice.vendor_name)}`}
                      className="text-sm text-blue-600 hover:text-blue-700"
                    >
                      View vendor →
                    </Link>
                  </div>
                </div>
              )}
            </div>
          )}

          <div className="bg-white rounded-xl border border-gray-200 p-5 mt-5">
            <h2 className="text-sm font-semibold text-gray-900 mb-4">Audit log</h2>
            {auditLog.length === 0 ? (
              <p className="text-gray-500 text-sm">No audit entries.</p>
            ) : (
              <div className="space-y-2">
                {auditLog.map((log) => (
                  <div key={log.id} className="flex items-start gap-3 text-sm border-b border-gray-50 pb-2 last:border-0">
                    <span className="text-gray-400 whitespace-nowrap">
                      {new Date(log.created_at).toLocaleString()}
                    </span>
                    <span className="font-medium text-gray-700">{log.actor}</span>
                    <span className="text-gray-600">
                      {log.from_status} → {log.to_status}
                    </span>
                    {log.reasoning && <span className="text-gray-500 italic">— {log.reasoning}</span>}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Sidebar column */}
        <div className="space-y-5">
          <div className="bg-emerald-50/60 rounded-xl border border-emerald-100 p-5">
            <h2 className="text-sm font-semibold text-gray-900 mb-3">Automation confidence</h2>
            <div className="flex items-center gap-3">
              <ChecksRing passed={passed} total={checks.length} />
              <div>
                <p className="text-sm font-semibold text-gray-900">{stageLabel}</p>
                <p className="text-xs text-gray-500">
                  {passed} of {checks.length} automation checks passed
                </p>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <h2 className="text-sm font-semibold text-gray-900 mb-3">
              {invoice.status === "flagged" ? "Why it needs review" : "Why it was auto-approved"}
            </h2>
            <ul className="space-y-2">
              {checks.map((c) => (
                <li key={c.label} className="flex items-center gap-2 text-sm">
                  {c.passed ? (
                    <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
                  ) : (
                    <XCircle className="w-4 h-4 text-red-500 shrink-0" />
                  )}
                  <span className={c.passed ? "text-gray-700" : "text-red-700"}>{c.label}</span>
                </li>
              ))}
            </ul>
          </div>

          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <h2 className="text-sm font-semibold text-gray-900 mb-3">Confidence</h2>
            <ConfidencePair extraction={invoice.extraction_confidence} category={invoice.category_confidence} />
            <p className="text-xs text-gray-400 mt-1">Extraction / Category</p>
          </div>

          {invoice.source_file_url && (
            <div className="bg-white rounded-xl border border-gray-200 p-5">
              <h2 className="text-sm font-semibold text-gray-900 mb-3">Source file</h2>
              {fileUrl ? (
                <a href={fileUrl} target="_blank" rel="noopener noreferrer" className="flex items-center justify-between gap-2 group">
                  <span className="flex items-center gap-2 min-w-0">
                    <FileText className="w-4 h-4 text-gray-400 shrink-0" />
                    <span className="text-sm text-blue-600 group-hover:text-blue-700 truncate">{fileName}</span>
                  </span>
                  <Download className="w-4 h-4 text-gray-400 shrink-0" />
                </a>
              ) : (
                <span className="flex items-center gap-2 min-w-0 text-gray-500 text-sm">
                  <FileText className="w-4 h-4 text-gray-400 shrink-0" />
                  <span className="truncate">{fileName}</span>
                </span>
              )}
              {fileSize && <p className="text-xs text-gray-400 mt-1">{fileSize}</p>}
            </div>
          )}

          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <h2 className="text-sm font-semibold text-gray-900 mb-3">Notes</h2>
            <textarea
              value={notesDraft}
              onChange={(e) => setNotesDraft(e.target.value)}
              placeholder="Add a note about this invoice..."
              rows={3}
              className="w-full text-sm border border-gray-200 rounded-lg p-2.5 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400 resize-none"
            />
            <button
              onClick={handleSaveNotes}
              disabled={savingNotes || notesDraft === (invoice.notes || "")}
              className="mt-2 px-3 py-1.5 text-sm font-medium bg-gray-900 text-white rounded-lg hover:bg-gray-800 disabled:opacity-40"
            >
              {savingNotes ? "Saving..." : "Save note"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string | null }) {
  return (
    <div>
      <dt className="text-xs text-gray-400 uppercase tracking-wide">{label}</dt>
      <dd className="mt-1 text-sm text-gray-900">{value || "—"}</dd>
    </div>
  );
}
