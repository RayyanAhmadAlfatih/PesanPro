"use client";

import { useState } from "react";
import { CheckCircle2, CreditCard, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ErrorScreen, formatDate, LoadingScreen } from "@/components/dashboard/superadmin/shared";
import { useSuperadminOverview } from "@/components/dashboard/superadmin/use-overview";
import { formatRupiah } from "@/lib/promo-pricing";

export default function SuperadminPembayaranPage() {
  const { data, loading, load } = useSuperadminOverview();
  const [reviewNotes, setReviewNotes] = useState<Record<string, string>>({});
  const [reviewingId, setReviewingId] = useState<string | null>(null);

  const reviewPayment = async (id: string, status: "APPROVED" | "REJECTED") => {
    const note = reviewNotes[id]?.trim() ?? "";
    if (note.length < 3) return toast.error("Tulis catatan pemeriksaan minimal 3 karakter.");
    setReviewingId(id);
    try {
      const response = await fetch(`/api/admin/payment-verifications/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status, reviewNote: note }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Pembayaran gagal diperiksa.");
      toast.success(status === "APPROVED" ? "Pembayaran disetujui, paket aktif." : "Pembayaran ditolak.");
      setReviewNotes((current) => ({ ...current, [id]: "" }));
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Pembayaran gagal diperiksa.");
    } finally {
      setReviewingId(null);
    }
  };

  if (loading && !data) return <LoadingScreen />;
  if (!data) return <ErrorScreen onRetry={() => void load()} />;

  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm font-semibold uppercase tracking-[0.2em] text-[var(--pp-muted)]">SuperAdmin</p>
        <h1 className="text-3xl font-bold tracking-tight">Verifikasi Pembayaran</h1>
        <p className="text-sm text-[var(--pp-muted)]">Setujui atau tolak pembayaran transfer manual untuk mengaktifkan paket tenant.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><CreditCard className="h-5 w-5" />Menunggu pemeriksaan</CardTitle>
          <CardDescription>{data.pendingPayments.length} pembayaran menunggu. Setujui untuk mengaktifkan paket dan mengunci harga perpanjangan.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {data.pendingPayments.length === 0 ? (
            <p className="rounded-lg border border-dashed border-[var(--pp-line)] p-6 text-center text-sm text-[var(--pp-muted)]">Tidak ada pembayaran menunggu.</p>
          ) : data.pendingPayments.map((payment) => (
            <div key={payment.id} className="rounded-lg border border-[var(--pp-line)] p-4">
              <div className="flex flex-wrap items-center gap-2">
                <p className="font-semibold">{payment.user.email}</p>
                <Badge variant="outline">{payment.billingCycle === "YEARLY" ? "TAHUNAN" : "BULANAN"}</Badge>
                <Badge variant="secondary">{payment.plan?.name ?? "Paket tidak dikenal"}</Badge>
                {payment.voucherCode ? <Badge variant="outline">{payment.voucherCode}</Badge> : null}
              </div>
              <p className="mt-1 text-sm">
                {formatRupiah(payment.amount)}
                {Number(payment.discountAmount) > 0 ? ` · diskon ${formatRupiah(payment.discountAmount)}` : ""}
                {" · "}{payment.reference ?? "tanpa referensi"}
              </p>
              <p className="mt-1 text-xs text-[var(--pp-muted)]">
                {payment.user.whatsappNumber ?? "Nomor WA belum ada"} · {formatDate(payment.createdAt)}
                {payment.bankAccount ? ` · ${payment.bankAccount.bankName} ${payment.bankAccount.accountNumber} a.n. ${payment.bankAccount.accountHolder}` : ""}
              </p>
              {payment.proofUrl ? <a className="mt-1 inline-block text-sm font-semibold underline underline-offset-4" href={payment.proofUrl} target="_blank" rel="noreferrer">Lihat bukti transfer</a> : null}
              <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                <Input
                  value={reviewNotes[payment.id] ?? ""}
                  onChange={(event) => setReviewNotes((current) => ({ ...current, [payment.id]: event.target.value }))}
                  placeholder="Catatan pemeriksaan, minimal 3 karakter"
                  aria-label={`Catatan untuk ${payment.user.email}`}
                />
                <div className="flex gap-2">
                  <Button disabled={reviewingId === payment.id} onClick={() => void reviewPayment(payment.id, "APPROVED")}>
                    {reviewingId === payment.id ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CheckCircle2 className="mr-2 h-4 w-4" />}Setujui
                  </Button>
                  <Button variant="outline" disabled={reviewingId === payment.id} onClick={() => void reviewPayment(payment.id, "REJECTED")}>Tolak</Button>
                </div>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
