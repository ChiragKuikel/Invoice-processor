"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import { Invoice } from "@/lib/types";
import { useSearch } from "@/lib/search-context";
import { StageBadge, QuickBooksBadge, ConfidencePair, STATUS_LABEL } from "@/components/badges";
import { Upload, ChevronLeft, ChevronRight, MoreHorizontal } from "lucide-react";
import Link from "next/link";

const INVOICE_EMAIL =
  process.env.NEXT_PUBLIC_INVOICE_EMAIL ?? "chiragkuinkeldrive3+invoices@gmail.com";

const STATUS_TABS: (Invoice["status"] | "all")[] = [
  "all",
  "pending",
  "processing",
  "flagged",
  "auto_approved",
  "reviewed",
  "error",
];

const PAGE_SIZE = 8;

export default function InvoicesPage() {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [filter, setFilter] = useState<string>("all");
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [uploadMsg, setUploadMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const { search } = useSearch();

  useEffect(() => {
    // Resetting pagination when the filter/search changes underneath it is
    // the correct behavior here, not an unintended cascade.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPage(0);
  }, [filter, search]);

  useEffect(() => {
    fetchInvoices();
    fetchCounts();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter, page, search]);

  async function fetchCounts() {
    const statuses: Invoice["status"][] = [
      "pending",
      "processing",
      "flagged",
      "auto_approved",
      "reviewed",
      "error",
    ];
    const results = await Promise.all(
      statuses.map((s) =>
        supabase.from("invoices").select("id", { count: "exact", head: true }).eq("status", s)
      )
    );
    const { count: total } = await supabase.from("invoices").select("id", { count: "exact", head: true });
    const next: Record<string, number> = { all: total ?? 0 };
    statuses.forEach((s, i) => (next[s] = results[i].count ?? 0));
    setCounts(next);
  }

  async function fetchInvoices() {
    setLoading(true);
    let query = supabase
      .from("invoices")
      .select(
        "*, invoice_pipeline_stage, invoice_review_reason, invoice_quickbooks_status",
        { count: "exact" }
      )
      .order("created_at", { ascending: false })
      .range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1);

    if (filter !== "all") query = query.eq("status", filter);
    if (search.trim()) {
      const term = search.trim().replace(/[%,]/g, "");
      query = query.or(
        `vendor_name.ilike.%${term}%,invoice_number.ilike.%${term}%`
      );
    }

    const { data, count } = await query;
    setInvoices(data || []);
    setTotalCount(count ?? 0);
    setLoading(false);
  }

  const [totalCount, setTotalCount] = useState(0);
  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;

    setUploading(true);
    setUploadMsg(null);

    try {
      const body = new FormData();
      body.append("file", file);
      const res = await fetch("/api/upload", { method: "POST", body });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Upload failed.");
      setUploadMsg({ ok: true, text: `"${file.name}" accepted — it appears below once OCR finishes.` });
      setTimeout(() => {
        fetchInvoices();
        fetchCounts();
      }, 4000);
    } catch (err) {
      setUploadMsg({ ok: false, text: err instanceof Error ? err.message : "Upload failed." });
    } finally {
      setUploading(false);
    }
  }

  const rangeLabel = useMemo(() => {
    if (totalCount === 0) return "0 invoices";
    const from = page * PAGE_SIZE + 1;
    const to = Math.min(totalCount, page * PAGE_SIZE + invoices.length);
    return `Showing ${from}-${to} of ${totalCount} invoices`;
  }, [page, invoices.length, totalCount]);

  return (
    <div className="max-w-[1400px] mx-auto px-6 py-6">
      <div className="flex items-start justify-between mb-5">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Invoices</h1>
          <p className="text-sm text-gray-500 mt-1">
            Manage and track all invoice processing activity.
          </p>
        </div>
        <label
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition ${
            uploading
              ? "bg-gray-200 text-gray-400 cursor-not-allowed"
              : "bg-blue-600 text-white hover:bg-blue-700 cursor-pointer"
          }`}
        >
          <Upload className="w-4 h-4" />
          {uploading ? "Uploading…" : "Upload invoice"}
          <input
            type="file"
            accept=".pdf,.png,.jpg,.jpeg,.webp,.bmp,.tif,.tiff"
            className="hidden"
            disabled={uploading}
            onChange={handleUpload}
          />
        </label>
      </div>

      <div className="flex items-center gap-3 mb-4 flex-wrap text-sm">
        <span className="text-gray-500">or forward it to</span>
        <span className="font-mono text-gray-700 bg-gray-100 px-2 py-1 rounded">{INVOICE_EMAIL}</span>
        {uploadMsg && (
          <span className={uploadMsg.ok ? "text-emerald-700" : "text-red-700"}>{uploadMsg.text}</span>
        )}
      </div>

      <div className="flex items-center gap-1 mb-4 flex-wrap border-b border-gray-200">
        {STATUS_TABS.map((s) => {
          const active = filter === s;
          const label = s === "all" ? "All" : STATUS_LABEL[s];
          const count = counts[s] ?? 0;
          return (
            <button
              key={s}
              onClick={() => setFilter(s)}
              className={`px-3.5 py-2.5 text-sm font-medium border-b-2 -mb-px transition ${
                active
                  ? "border-blue-600 text-blue-600"
                  : "border-transparent text-gray-500 hover:text-gray-700"
              }`}
            >
              {label} <span className="text-gray-400">({count})</span>
            </button>
          );
        })}
      </div>

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        {loading ? (
          <p className="text-gray-500 p-6 text-sm">Loading...</p>
        ) : invoices.length === 0 ? (
          <p className="text-gray-500 p-6 text-sm">No invoices found.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 text-left text-xs font-medium text-gray-400 uppercase tracking-wide">
                  <th className="px-4 py-3">Invoice</th>
                  <th className="px-4 py-3">Vendor</th>
                  <th className="px-4 py-3">Amount</th>
                  <th className="px-4 py-3">Received</th>
                  <th className="px-4 py-3">Processing</th>
                  <th className="px-4 py-3">QuickBooks</th>
                  <th className="px-4 py-3">Confidence</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {invoices.map((inv) => (
                  <tr key={inv.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 font-medium text-gray-900">
                      <Link href={`/invoices/${inv.id}`} className="hover:text-blue-600">
                        {inv.invoice_number || "—"}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-gray-700">{inv.vendor_name || "—"}</td>
                    <td className="px-4 py-3 text-gray-700 tabular-nums">
                      {inv.total != null ? `${inv.currency || ""} ${inv.total.toFixed(2)}` : "—"}
                    </td>
                    <td className="px-4 py-3 text-gray-500 whitespace-nowrap">
                      {new Date(inv.created_at).toLocaleString(undefined, {
                        month: "short",
                        day: "numeric",
                        hour: "numeric",
                        minute: "2-digit",
                      })}
                    </td>
                    <td className="px-4 py-3">
                      <StageBadge stage={inv.invoice_pipeline_stage} />
                    </td>
                    <td className="px-4 py-3">
                      <QuickBooksBadge status={inv.invoice_quickbooks_status} />
                    </td>
                    <td className="px-4 py-3">
                      <ConfidencePair extraction={inv.extraction_confidence} category={inv.category_confidence} />
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Link
                        href={`/invoices/${inv.id}`}
                        className="inline-flex items-center justify-center w-7 h-7 rounded-md text-gray-400 hover:bg-gray-100 hover:text-gray-600"
                      >
                        <MoreHorizontal className="w-4 h-4" />
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="flex items-center justify-between mt-4 text-sm text-gray-500">
        <span>{rangeLabel}</span>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setPage((p) => Math.max(0, p - 1))}
            disabled={page === 0}
            className="w-8 h-8 flex items-center justify-center rounded-md border border-gray-200 disabled:opacity-40 hover:bg-gray-50"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <span className="px-2">
            {page + 1} / {totalPages}
          </span>
          <button
            onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
            disabled={page >= totalPages - 1}
            className="w-8 h-8 flex items-center justify-center rounded-md border border-gray-200 disabled:opacity-40 hover:bg-gray-50"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
