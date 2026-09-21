import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { getAuthenticatedUser, isAdmin } from "@/lib/api-auth";

export async function SuperadminOnly({ children }: { children: ReactNode }) {
  const actor = await getAuthenticatedUser();

  if (!actor || !isAdmin(actor.role)) {
    redirect("/dashboard");
  }

  return children;
}
