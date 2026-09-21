import type { ReactNode } from "react";
import { SuperadminOnly } from "@/components/dashboard/superadmin-only";

export default function SettingsLayout({ children }: { children: ReactNode }) {
  return <SuperadminOnly>{children}</SuperadminOnly>;
}
