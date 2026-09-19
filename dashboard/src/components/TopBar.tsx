"use client";

import { Search } from "lucide-react";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

export function TopBar({
  search,
  onSearchChange,
  userEmail,
}: {
  search: string;
  onSearchChange: (v: string) => void;
  userEmail: string | null;
}) {
  const [open, setOpen] = useState(false);
  const router = useRouter();

  async function handleSignOut() {
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  const initial = userEmail ? userEmail[0].toUpperCase() : "?";

  return (
    <header className="h-16 border-b border-gray-200 bg-white flex items-center gap-4 px-6 sticky top-0 z-10">
      <div className="relative flex-1 max-w-xl">
        <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
        <input
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder="Search invoices, vendors, or invoice numbers..."
          className="w-full pl-9 pr-3 py-2 text-sm rounded-lg border border-gray-200 bg-gray-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400 transition"
        />
      </div>

      <div className="flex items-center gap-3 ml-auto">
        <span className="hidden sm:flex items-center gap-1.5 text-xs font-medium text-gray-500 border border-gray-200 rounded-full px-2.5 py-1">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
          QuickBooks
        </span>

        <div className="relative">
          <button
            onClick={() => setOpen((v) => !v)}
            className="w-8 h-8 rounded-full bg-blue-600 text-white text-sm font-semibold flex items-center justify-center"
          >
            {initial}
          </button>
          {open && (
            <div className="absolute right-0 mt-2 w-44 bg-white border border-gray-200 rounded-lg shadow-lg py-1 text-sm">
              <div className="px-3 py-2 text-gray-500 truncate border-b border-gray-100">
                {userEmail}
              </div>
              <button
                onClick={handleSignOut}
                className="w-full text-left px-3 py-2 text-gray-700 hover:bg-gray-50"
              >
                Sign out
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
