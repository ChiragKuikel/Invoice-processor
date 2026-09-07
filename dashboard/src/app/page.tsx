"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { Invoice } from "@/lib/types";
import Link from "next/link";

const STATUS_COLORS: Record<string, string> = {
  pending: "bg-yellow-100 text-yellow-800",
  processing: "bg-blue-100 text-blue-800",
  auto_approved: "bg-green-100 text-green-800",
  flagged: "bg-red-100 text-red-800",
  reviewed: "bg-purple-100 text-purple-800",
  error: "bg-gray-100 text-gray-800",
};

export default function HomePage() {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [filter, setFilter] = useState<string>("all");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchInvoices();
  }, [filter]);

  async function fetchInvoices() {
    setLoading(true);
    let query = supabase
      .from("invoices")
      .select("*")
      .order("created_at", { ascending: false });

    if (filter !== "all") {
      query = query.eq("status", filter);
    }

    const { data } = await query;
    setInvoices(data || []);
    setLoading(false);
  }

  async function handleSignOut() {
    await supabase.auth.signOut();
    window.location.href = "/login";
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white shadow">
        <div className="max-w-7xl mx-auto px-4 py-4 flex justify-between items-center">
          <h1 className="text-xl font-bold">Invoice Processor</h1>
          <button
            onClick={handleSignOut}
            className="text-sm text-gray-500 hover:text-gray-700"
          >
            Sign Out
          </button>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-6">
        <div className="flex gap-2 mb-6 flex-wrap">
          {["all", "pending", "processing", "flagged", "auto_approved", "reviewed", "error"].map(
            (s) => (
              <button
                key={s}
                onClick={() => setFilter(s)}
                className={`px-3 py-1 rounded-full text-sm font-medium transition ${
                  filter === s
                    ? "bg-blue-600 text-white"
                    : "bg-white text-gray-600 hover:bg-gray-100 border"
                }`}
              >
                {s === "all" ? "All" : s.replace("_", " ")}
              </button>
            )
          )}
        </div>

        {loading ? (
          <p className="text-gray-500">Loading...</p>
        ) : invoices.length === 0 ? (
          <p className="text-gray-500">No invoices found.</p>
        ) : (
          <div className="bg-white rounded-lg shadow overflow-hidden">
            <table className="w-full">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                    Vendor
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                    Invoice #
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                    Date
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                    Total
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                    Category
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                    Status
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                    Flags
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {invoices.map((inv) => (
                  <tr key={inv.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 text-sm font-medium text-gray-900">
                      <Link
                        href={`/invoices/${inv.id}`}
                        className="text-blue-600 hover:underline"
                      >
                        {inv.vendor_name || "—"}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600">
                      {inv.invoice_number || "—"}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600">
                      {inv.invoice_date || "—"}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600">
                      {inv.total != null
                        ? `${inv.currency || ""} ${inv.total.toFixed(2)}`
                        : "—"}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600">
                      {inv.category || "—"}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`px-2 py-1 rounded-full text-xs font-medium ${
                          STATUS_COLORS[inv.status] || "bg-gray-100"
                        }`}
                      >
                        {inv.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600">
                      {inv.flags?.length > 0 ? (
                        <div className="flex gap-1 flex-wrap">
                          {inv.flags.map((f) => (
                            <span
                              key={f}
                              className="px-1.5 py-0.5 bg-red-50 text-red-700 rounded text-xs"
                            >
                              {f}
                            </span>
                          ))}
                        </div>
                      ) : (
                        "—"
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </main>
    </div>
  );
}
