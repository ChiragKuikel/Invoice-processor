"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { VendorDirectoryEntry } from "@/lib/types";
import { useSearch } from "@/lib/search-context";
import { AlertTriangle, CheckCircle2 } from "lucide-react";

export default function VendorsPage() {
  const [vendors, setVendors] = useState<VendorDirectoryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const { search, setSearch } = useSearch();
  const searchParams = useSearchParams();

  // Lets the invoice detail page's "View vendor" link land here pre-filtered.
  useEffect(() => {
    const q = searchParams.get("q");
    if (q) setSearch(q);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function fetchVendors() {
    setLoading(true);
    let query = supabase
      .from("vendor_directory")
      .select("*")
      .order("invoice_count", { ascending: false });

    if (search.trim()) {
      const term = search.trim().replace(/[%,]/g, "");
      query = query.ilike("display_name", `%${term}%`);
    }

    const { data } = await query;
    setVendors(data || []);
    setLoading(false);
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchVendors();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  const duplicateCount = vendors.filter((v) => v.has_name_variants).length;

  return (
    <div className="max-w-[1100px] mx-auto px-6 py-6">
      <div className="mb-5">
        <h1 className="text-2xl font-semibold text-gray-900">Vendors</h1>
        <p className="text-sm text-gray-500 mt-1">
          Manage vendor records and detect duplicate names.
          {duplicateCount > 0 && (
            <span className="text-amber-700">
              {" "}
              {duplicateCount} vendor{duplicateCount === 1 ? "" : "s"}{" "}
              {duplicateCount === 1 ? "has" : "have"} inconsistent spelling.
            </span>
          )}
        </p>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        {loading ? (
          <p className="text-gray-500 p-6 text-sm">Loading...</p>
        ) : vendors.length === 0 ? (
          <p className="text-gray-500 p-6 text-sm">No vendors found.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 text-left text-xs font-medium text-gray-400 uppercase tracking-wide">
                <th className="px-4 py-3">Vendor</th>
                <th className="px-4 py-3">Invoices</th>
                <th className="px-4 py-3">Total spend</th>
                <th className="px-4 py-3">Last invoice</th>
                <th className="px-4 py-3">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {vendors.map((v) => (
                <tr key={v.vendor_key} className="hover:bg-gray-50 align-top">
                  <td className="px-4 py-3">
                    <p className="font-medium text-gray-900">{v.display_name}</p>
                    {v.has_name_variants && (
                      <div className="flex gap-1.5 flex-wrap mt-1">
                        {v.name_variants
                          .filter((n) => n !== v.display_name)
                          .map((n) => (
                            <span key={n} className="text-xs bg-amber-50 text-amber-700 px-1.5 py-0.5 rounded">
                              {n}
                            </span>
                          ))}
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3 text-gray-700 tabular-nums">{v.invoice_count}</td>
                  <td className="px-4 py-3 text-gray-700 tabular-nums">
                    ${v.total_amount.toFixed(2)}
                  </td>
                  <td className="px-4 py-3 text-gray-500">{v.last_invoice_date || "—"}</td>
                  <td className="px-4 py-3">
                    {v.has_name_variants ? (
                      <span className="inline-flex items-center gap-1.5 text-xs font-medium text-amber-700 bg-amber-50 px-2 py-1 rounded-md">
                        <AlertTriangle className="w-3.5 h-3.5" />
                        Potential duplicate
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-700">
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        Verified
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
