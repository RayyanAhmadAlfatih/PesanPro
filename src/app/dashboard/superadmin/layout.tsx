import type { ReactNode } from "react";
import { SuperadminOnly } from "@/components/dashboard/superadmin-only";

/** Cek peran di server, bukan hanya lewat tampilan atau middleware. */
export default function SuperadminLayout({ children }: { children: ReactNode }) {
  return <SuperadminOnly>{children}</SuperadminOnly>;
}
