"use client";

import { useState } from "react";
import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";

export function ErrorBoundaryTrigger() {
  const [shouldThrow, setShouldThrow] = useState(false);

  if (shouldThrow) {
    throw new Error("QA controlled error boundary test");
  }

  return (
    <section className="mx-auto max-w-xl rounded-2xl border border-amber-200 bg-amber-50 p-6 text-amber-950">
      <div className="flex items-start gap-3">
        <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" />
        <div className="space-y-3">
          <div>
            <h1 className="text-lg font-semibold">Controlled error-boundary test</h1>
            <p className="mt-1 text-sm leading-6">
              This QA-only action throws a local render error so the Next.js error boundary can be verified safely.
              It does not modify application data.
            </p>
          </div>
          <Button type="button" variant="destructive" onClick={() => setShouldThrow(true)}>
            Trigger controlled error
          </Button>
        </div>
      </div>
    </section>
  );
}
