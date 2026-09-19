"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  FileText,
  ListChecks,
  Users,
  SlidersHorizontal,
  Activity,
  Settings,
  CheckCircle2,
} from "lucide-react";

const NAV = [
  { href: "/overview", label: "Overview", icon: LayoutDashboard, enabled: false },
  { href: "/", label: "Invoices", icon: FileText, enabled: true, countKey: "invoices" as const },
  { href: "/review", label: "Review queue", icon: ListChecks, enabled: true, countKey: "review" as const },
  { href: "/vendors", label: "Vendors", icon: Users, enabled: true },
  { href: "/rules", label: "Rules", icon: SlidersHorizontal, enabled: false },
  { href: "/activity", label: "Activity", icon: Activity, enabled: false },
];

export function Sidebar({
  counts,
}: {
  counts: { invoices: number; review: number };
}) {
  const pathname = usePathname();

  return (
    <aside className="w-60 shrink-0 bg-[#0b1220] text-slate-300 flex flex-col h-screen sticky top-0">
      <div className="flex items-center gap-2 px-5 h-16 border-b border-white/5">
        <div className="w-7 h-7 rounded-md bg-blue-600 flex items-center justify-center text-white font-bold text-sm">
          I
        </div>
        <span className="text-white font-semibold text-[15px]">InvoiceFlow</span>
      </div>

      <nav className="flex-1 px-3 py-4 space-y-0.5">
        {NAV.map((item) => {
          const Icon = item.icon;
          const active = item.enabled && pathname === item.href;
          const count =
            item.countKey === "invoices"
              ? counts.invoices
              : item.countKey === "review"
              ? counts.review
              : null;

          const content = (
            <span
              className={`flex items-center justify-between gap-2 px-3 py-2 rounded-lg text-sm transition ${
                active
                  ? "bg-blue-600/15 text-white"
                  : item.enabled
                  ? "text-slate-300 hover:bg-white/5 hover:text-white"
                  : "text-slate-600 cursor-not-allowed"
              }`}
            >
              <span className="flex items-center gap-2.5">
                <Icon className={`w-4 h-4 ${active ? "text-blue-400" : ""}`} strokeWidth={2} />
                {item.label}
              </span>
              {count != null && count > 0 && (
                <span
                  className={`text-xs px-1.5 py-0.5 rounded-full ${
                    active ? "bg-blue-600 text-white" : "bg-white/10 text-slate-300"
                  }`}
                >
                  {count}
                </span>
              )}
            </span>
          );

          return item.enabled ? (
            <Link key={item.href} href={item.href}>
              {content}
            </Link>
          ) : (
            <div key={item.href} title="Not built yet">
              {content}
            </div>
          );
        })}
      </nav>

      <div className="px-3 pb-3">
        <div
          className={`text-slate-600 flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm cursor-not-allowed`}
          title="Not built yet"
        >
          <Settings className="w-4 h-4" strokeWidth={2} />
          Settings
        </div>
      </div>

      <div className="mx-3 mb-4 rounded-lg bg-white/5 px-3 py-3">
        <div className="flex items-center gap-2 text-sm text-white">
          <CheckCircle2 className="w-4 h-4 text-emerald-400" />
          QuickBooks
        </div>
        <p className="text-xs text-slate-400 mt-1">Connected</p>
      </div>
    </aside>
  );
}
