import {
  Inbox,
  FileSearch,
  AlertTriangle,
  CheckCircle2,
  BadgeCheck,
  XCircle,
  Send,
  Ban,
} from "lucide-react";
import { Invoice } from "@/lib/types";

const STAGE_META: Record<
  Invoice["invoice_pipeline_stage"],
  { label: string; icon: typeof Inbox; className: string }
> = {
  received: { label: "Received", icon: Inbox, className: "bg-gray-100 text-gray-600" },
  extracted: { label: "Extracted", icon: FileSearch, className: "bg-blue-50 text-blue-700" },
  needs_review: { label: "Needs review", icon: AlertTriangle, className: "bg-amber-50 text-amber-700" },
  approved: { label: "Approved", icon: CheckCircle2, className: "bg-emerald-50 text-emerald-700" },
  synced: { label: "Synced", icon: BadgeCheck, className: "bg-emerald-100 text-emerald-800" },
  failed: { label: "Failed", icon: XCircle, className: "bg-red-50 text-red-700" },
  unknown: { label: "Unknown", icon: Inbox, className: "bg-gray-100 text-gray-500" },
};

export function StageBadge({ stage }: { stage: Invoice["invoice_pipeline_stage"] }) {
  const meta = STAGE_META[stage] ?? STAGE_META.unknown;
  const Icon = meta.icon;
  return (
    <span className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-md text-xs font-medium ${meta.className}`}>
      <Icon className="w-3.5 h-3.5" />
      {meta.label}
    </span>
  );
}

const QB_META: Record<Invoice["invoice_quickbooks_status"], { label: string; icon: typeof Send; className: string }> = {
  synced: { label: "Synced", icon: BadgeCheck, className: "text-emerald-700" },
  not_sent: { label: "Not sent", icon: Send, className: "text-gray-400" },
  failed: { label: "Failed", icon: Ban, className: "text-red-600" },
};

export function QuickBooksBadge({ status }: { status: Invoice["invoice_quickbooks_status"] }) {
  const meta = QB_META[status];
  const Icon = meta.icon;
  return (
    <span className={`inline-flex items-center gap-1.5 text-xs font-medium ${meta.className}`}>
      <Icon className="w-3.5 h-3.5" />
      {meta.label}
    </span>
  );
}

function confidenceColor(v: number | null): string {
  if (v == null) return "text-gray-400";
  if (v >= 0.9) return "text-emerald-600";
  if (v >= 0.7) return "text-amber-600";
  return "text-red-600";
}

export function ConfidencePair({
  extraction,
  category,
}: {
  extraction: number | null;
  category: number | null;
}) {
  const fmt = (v: number | null) => (v == null ? "—" : `${Math.round(v * 100)}%`);
  return (
    <div className="flex items-center gap-2 text-xs font-medium tabular-nums">
      <span className={confidenceColor(extraction)} title="Extraction confidence">
        {fmt(extraction)}
      </span>
      <span className="text-gray-300">/</span>
      <span className={confidenceColor(category)} title="Category confidence">
        {fmt(category)}
      </span>
    </div>
  );
}

export const REVIEW_REASON_LABEL: Record<string, string> = {
  missing_invoice_number: "Missing invoice #",
  amount_anomaly: "Amount anomaly",
  other: "Other",
};

// Automation checklist for the invoice detail page. Every item is a direct
// read of a real column or a real flag — nothing here is invented; a check
// that isn't backed by actual data (e.g. "duplicate check" — true duplicates
// are hard-rejected pre-insert and never reach this page) is left out rather
// than faked as always-passing.
export function getAutomationChecks(inv: Invoice): { label: string; passed: boolean }[] {
  return [
    { label: "Vendor identified", passed: !!inv.vendor_name },
    { label: "Invoice number extracted", passed: !inv.flags?.includes("missing_invoice_number") },
    { label: "Amount extracted", passed: inv.total != null },
    {
      label: "Total matches line items",
      passed: !inv.flags?.includes("total_mismatch") && !inv.flags?.includes("invalid_line_item_amount"),
    },
    { label: "Amount within normal range", passed: !inv.flags?.includes("anomalous_amount") },
    { label: "Category assigned", passed: !!inv.category },
  ];
}

// Ring shows (passed checks) / (total checks) from getAutomationChecks — the
// same 6 real checks shown as a list elsewhere on the page. Deliberately not
// "35 of 38" or any other invented denominator.
export function ChecksRing({ passed, total }: { passed: number; total: number }) {
  const pct = total === 0 ? 0 : Math.round((passed / total) * 100);
  const color = pct === 100 ? "#059669" : pct >= 60 ? "#d97706" : "#dc2626";
  return (
    <div
      className="w-16 h-16 rounded-full flex items-center justify-center shrink-0"
      style={{
        background: `conic-gradient(${color} ${pct}%, #e5e7eb ${pct}%)`,
      }}
    >
      <div className="w-12 h-12 rounded-full bg-white flex items-center justify-center text-sm font-semibold text-gray-900">
        {pct}%
      </div>
    </div>
  );
}

export const STATUS_LABEL: Record<Invoice["status"], string> = {
  pending: "Pending",
  processing: "Processing",
  auto_approved: "Auto approved",
  flagged: "Flagged",
  reviewed: "Reviewed",
  error: "Error",
};
