import type { ReactNode } from "react";
import { SuperadminOnly } from "@/components/dashboard/superadmin-only";
import { SuperadminSubNav } from "@/components/dashboard/superadmin/sub-nav";

/** Cek peran di server, bukan hanya lewat tampilan atau middleware. */
export default function SuperadminLayout({ children }: { children: ReactNode }) {
  return (
    <SuperadminOnly>
      <div className="space-y-5 p-4 md:p-8">
        <SuperadminSubNav />
        {children}
      </div>
    </SuperadminOnly>
  );
}
