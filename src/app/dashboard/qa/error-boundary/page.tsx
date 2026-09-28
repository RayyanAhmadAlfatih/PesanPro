import { notFound } from "next/navigation";
import { auth } from "@/lib/auth";
import { getEnv } from "@/lib/env";
import { ErrorBoundaryTrigger } from "./trigger";

export const dynamic = "force-dynamic";

export default async function QaErrorBoundaryPage() {
  const env = getEnv();
  const session = await auth();

  if (!env.PESANPRO_QA_MODE || session?.user?.role !== "SUPERADMIN") {
    notFound();
  }

  return <ErrorBoundaryTrigger />;
}
