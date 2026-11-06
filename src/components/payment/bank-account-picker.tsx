"use client";

import { useState } from "react";
import { CheckCircle2, Copy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatAccountNumberDisplay } from "@/lib/bank-list";
import { cn } from "@/lib/utils";

export interface BankAccountOption {
  id: string;
  bankName: string;
  accountNumber: string;
  accountHolder: string;
  isDefault?: boolean;
}

/**
 * Daftar rekening tujuan transfer manual, dipakai bersama oleh halaman
 * pendaftaran (Langkah 3) dan halaman Tagihan (checkout/perpanjangan)
 * supaya tampilan dan aturannya tidak pernah berbeda (F1.2).
 *
 * Pemilihan rekening memakai radio asli (bukan tombol) supaya keyboard dan
 * screen reader berperilaku benar; tombol Salin menyalin nomor rapat (angka
 * saja) ke clipboard.
 */
export function BankAccountPicker({
  accounts,
  value,
  onChange,
  name,
}: {
  accounts: BankAccountOption[];
  value: string;
  onChange: (accountId: string) => void;
  /** Nama field untuk input radio (dipakai test DOM). */
  name?: string;
}) {
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const copy = async (account: BankAccountOption) => {
    try {
      await navigator.clipboard.writeText(account.accountNumber.replace(/\D/g, ""));
      setCopiedId(account.id);
      window.setTimeout(() => setCopiedId((current) => (current === account.id ? null : current)), 2000);
    } catch {
      setCopiedId(null);
    }
  };

  if (accounts.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-[var(--pp-line)] p-4">
        <p className="text-sm font-semibold">Rekening tujuan belum diatur</p>
        <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
          Hubungi admin untuk nomor rekening sebelum transfer.
        </p>
      </div>
    );
  }

  return (
    <div role="radiogroup" aria-label="Rekening tujuan transfer" className="grid gap-2">
      {accounts.map((account) => {
        const selected = account.id === value;
        const inputId = `${name ?? "bankAccountId"}-${account.id}`;
        return (
          <div
            key={account.id}
            className={cn(
              "rounded-lg border p-4 transition-colors",
              selected
                ? "border-[var(--pp-ink)] bg-[var(--pp-highlight)]/25 ring-2 ring-[var(--pp-ink)]/15"
                : "border-[var(--pp-line)] bg-[var(--pp-white)]",
            )}
          >
            <div className="flex items-start gap-3">
              <input
                id={inputId}
                type="radio"
                name={name ?? "bankAccountId"}
                value={account.id}
                checked={selected}
                onChange={() => onChange(account.id)}
                className="sr-only"
              />
              <label htmlFor={inputId} className="flex min-w-0 flex-1 cursor-pointer flex-col gap-1">
                <span className="flex flex-wrap items-center gap-2">
                  <span className="text-lg font-bold">{account.bankName}</span>
                  {account.isDefault ? (
                    <span className="rounded-full bg-[var(--pp-mint)] px-2 py-0.5 text-xs font-semibold">Rekening utama</span>
                  ) : null}
                  {selected ? <CheckCircle2 className="h-4 w-4" aria-hidden="true" /> : null}
                </span>
                <span className="font-[family-name:var(--font-display)] text-2xl font-extrabold tabular-nums">
                  {formatAccountNumberDisplay(account.accountNumber)}
                </span>
                <span className="text-sm text-muted-foreground">a.n. {account.accountHolder}</span>
              </label>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="min-h-11"
                onClick={() => void copy(account)}
                aria-label={`Salin nomor rekening ${account.bankName}`}
              >
                <Copy className="mr-1.5 h-4 w-4" aria-hidden="true" />
                {copiedId === account.id ? "Tersalin" : "Salin"}
              </Button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
