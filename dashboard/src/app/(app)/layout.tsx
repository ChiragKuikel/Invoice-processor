"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { Sidebar } from "@/components/Sidebar";
import { TopBar } from "@/components/TopBar";
import { supabase } from "@/lib/supabase";
import { SearchProvider, useSearch } from "@/lib/search-context";

function Shell({ children }: { children: React.ReactNode }) {
  const [counts, setCounts] = useState({ invoices: 0, review: 0 });
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const { search, setSearch } = useSearch();
  const pathname = usePathname();

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setUserEmail(data.user?.email ?? null));

    async function loadCounts() {
      const [{ count: invoiceCount }, { count: reviewCount }] = await Promise.all([
        supabase.from("invoices").select("id", { count: "exact", head: true }),
        supabase.from("invoices").select("id", { count: "exact", head: true }).eq("status", "flagged"),
      ]);
      setCounts({ invoices: invoiceCount ?? 0, review: reviewCount ?? 0 });
    }
    loadCounts();
  }, [pathname]);

  // Search only makes sense on list pages; clear it when leaving them so it
  // doesn't silently filter a page that has no search UI of its own. The
  // vendors page seeds this from its own ?q= on mount — excluding it here
  // would have that seed effect (child) immediately stomped by this one
  // (parent), since child effects run before parent effects on mount.
  const isListPage = pathname === "/" || pathname === "/review" || pathname === "/vendors";
  useEffect(() => {
    if (!isListPage) setSearch("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  return (
    <div className="flex min-h-screen bg-gray-50">
      <Sidebar counts={counts} />
      <div className="flex-1 flex flex-col min-w-0">
        <TopBar search={search} onSearchChange={setSearch} userEmail={userEmail} />
        <main className="flex-1 min-w-0">{children}</main>
      </div>
    </div>
  );
}

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <SearchProvider>
      <Shell>{children}</Shell>
    </SearchProvider>
  );
}
