"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { Invoice } from "@/lib/types";
import { useSearch } from "@/lib/search-context";
import { REVIEW_REASON_LABEL } from "@/components/badges";
import { AlertTriangle, FileWarning, HelpCircle, ArrowRight } from "lucide-react";

const REASON_TABS: (Invoice["invoice_review_reason"] | "all")[] = [
  "all",
  "missing_invoice_number",
  "amount_anomaly",
  "other",
];

const REASON_ICON: Record<string, typeof AlertTriangle> = {
  missing_invoice_number: FileWarning,
  amount_anomaly: AlertTriangle,
  other: HelpCircle,
};

export default function ReviewQueuePage() {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [tab, setTab] = useState<string>("all");
  const [loading, setLoading] = useState(true);
  const { search } = useSearch();

  async function fetchData() {
    setLoading(true);

    let query = supabase
      .from("invoices")
      .select("*, invoice_pipeline_stage, invoice_review_reason, invoice_quickbooks_status")
      .eq("status", "flagged")
      .order("created_at", { ascending: false });

    if (tab !== "all") query = query.eq("invoice_review_reason", tab);
    if (search.trim()) {
      const term = search.trim().replace(/[%,]/g, "");
      query = query.or(`vendor_name.ilike.%${term}%,invoice_number.ilike.%${term}%`);
    }

    const { data } = await query;
    setInvoices(data || []);

    const allFlagged = await supabase
      .from("invoices")
      .select("invoice_review_reason", { count: "exact" })
      .eq("status", "flagged");

    const next: Record<string, number> = { all: allFlagged.data?.length ?? 0 };
    for (const reason of ["missing_invoice_number", "amount_anomaly", "other"]) {
      next[reason] = (allFlagged.data || []).filter((r) => r.invoice_review_reason === reason).length;
    }
    setCounts(next);
    setLoading(false);
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, search]);

  return (
    <div className="max-w-[1000px] mx-auto px-6 py-6">
      <div className="mb-5">
        <h1 className="text-2xl font-semibold text-gray-900">Review queue</h1>
        <p className="text-sm text-gray-500 mt-1">
          {counts.all ?? 0} invoice{(counts.all ?? 0) === 1 ? "" : "s"} need your attention.
        </p>
      </div>

      <div className="flex items-center gap-1 mb-5 flex-wrap border-b border-gray-200">
        {REASON_TABS.map((r) => {
          const key = r ?? "other";
          const active = tab === key;
          const label = key === "all" ? "All" : REVIEW_REASON_LABEL[key];
          return (
            <button
              key={key}
              onClick={() => setTab(key)}
              className={`px-3.5 py-2.5 text-sm font-medium border-b-2 -mb-px transition ${
                active ? "border-blue-600 text-blue-600" : "border-transparent text-gray-500 hover:text-gray-700"
              }`}
            >
              {label} <span className="text-gray-400">({counts[key] ?? 0})</span>
            </button>
          );
        })}
      </div>

      {loading ? (
        <p className="text-gray-500 text-sm">Loading...</p>
      ) : invoices.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-10 text-center text-gray-500 text-sm">
          Nothing needs review right now.
        </div>
      ) : (
        <div className="space-y-3">
          {invoices.map((inv) => {
            const reasonKey = inv.invoice_review_reason ?? "other";
            const Icon = REASON_ICON[reasonKey] ?? HelpCircle;
            return (
              <div
                key={inv.id}
                className="bg-white rounded-xl border border-gray-200 p-4 flex items-start gap-4"
              >
                <div className="w-9 h-9 rounded-lg bg-amber-50 text-amber-600 flex items-center justify-center shrink-0">
                  <Icon className="w-4.5 h-4.5" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs font-medium text-amber-700 bg-amber-50 px-2 py-0.5 rounded">
                      {REVIEW_REASON_LABEL[reasonKey]}
                    </span>
                    <span className="text-xs text-gray-400">
                      {new Date(inv.created_at).toLocaleString(undefined, {
                        month: "short",
                        day: "numeric",
                        hour: "numeric",
                        minute: "2-digit",
                      })}
                    </span>
                  </div>
                  <p className="text-sm font-medium text-gray-900 mt-1">
                    {inv.vendor_name || "Unknown vendor"} · {inv.invoice_number || "no invoice #"}
                    {inv.total != null && (
                      <span className="text-gray-500 font-normal">
                        {" "}
                        · {inv.currency || ""} {inv.total.toFixed(2)}
                      </span>
                    )}
                  </p>
                  {inv.anomaly_note && (
                    <p className="text-sm text-gray-500 mt-1">{inv.anomaly_note}</p>
                  )}
                  {inv.flags?.length > 0 && (
                    <div className="flex gap-1.5 flex-wrap mt-2">
                      {inv.flags.map((f) => (
                        <span key={f} className="text-xs bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded">
                          {f}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
                <Link
                  href={`/invoices/${inv.id}`}
                  className="flex items-center gap-1 text-sm font-medium text-blue-600 hover:text-blue-700 whitespace-nowrap shrink-0"
                >
                  Review <ArrowRight className="w-3.5 h-3.5" />
                </Link>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
