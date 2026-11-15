"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const TABS: Array<{ href: string; label: string }> = [
  { href: "/dashboard/superadmin", label: "Ringkasan" },
  { href: "/dashboard/superadmin/pemasukan", label: "Pemasukan" },
  { href: "/dashboard/superadmin/promo", label: "Promo & Voucher" },
  { href: "/dashboard/superadmin/vps", label: "VPS & Kapasitas" },
  { href: "/dashboard/superadmin/pembayaran", label: "Verifikasi Pembayaran" },
  { href: "/dashboard/superadmin/harga", label: "Harga Paket" },
];

/** Sub-menu SuperAdmin: setiap fitur punya halaman sendiri. */
export function SuperadminSubNav() {
  const pathname = usePathname();
  return (
    <nav aria-label="Sub-menu SuperAdmin" className="flex flex-wrap gap-2 border-b border-[var(--pp-line)] pb-3">
      {TABS.map((tab) => {
        const active = pathname === tab.href;
        return (
          <Link
            key={tab.href}
            href={tab.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "rounded-full border px-4 py-1.5 text-sm font-semibold transition-colors",
              active
                ? "border-[var(--pp-ink)] bg-[var(--pp-highlight)] text-[var(--pp-ink)] shadow-[inset_0_0_0_1px_var(--pp-ink)]"
                : "border-[var(--pp-line)] bg-[var(--pp-white)] text-[var(--pp-muted)] hover:border-[var(--pp-ink)] hover:text-[var(--pp-ink)]",
            )}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
