"use client";

import { useEffect, useEffectEvent, useState } from "react";
import { BellRing, LoaderCircle, Pencil, Plus, RefreshCw, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  ANNOUNCEMENT_LINE_MAX_LENGTH,
  ANNOUNCEMENT_MAX_LINES,
  ANNOUNCEMENT_TITLE_MAX_LENGTH,
  parseAnnouncementLines,
} from "@/lib/announcement-policy";

type AnnouncementStatus = "DRAFT" | "PUBLISHED";

interface AnnouncementRow {
  id: string;
  title: string;
  body: string;
  version: string | null;
  href: string | null;
  status: AnnouncementStatus;
  source: "MANUAL" | "AUTO";
  publishedAt: string | null;
  createdAt: string;
  updatedAt: string;
  createdBy: { email: string } | null;
}

interface FormState {
  title: string;
  body: string;
  version: string;
  href: string;
  publish: boolean;
}

const EMPTY_FORM: FormState = { title: "", body: "", version: "", href: "", publish: false };

const STATUS_TONE: Record<AnnouncementStatus, string> = {
  DRAFT: "border-[var(--pp-line)] bg-[var(--pp-blush)] text-[var(--pp-ink)]",
  PUBLISHED: "border-[var(--pp-line)] bg-[var(--pp-mint)] text-[var(--pp-ink)]",
};

function validate(form: FormState): string | null {
  if (form.title.trim().length < 3) return "Judul minimal 3 karakter.";
  const lines = parseAnnouncementLines(form.body);
  if (lines.length === 0) return "Isi minimal satu poin.";
  if (lines.length > ANNOUNCEMENT_MAX_LINES) {
    return `Maksimal ${ANNOUNCEMENT_MAX_LINES} poin. Ringkas isinya.`;
  }
  if (lines.some((line) => line.length > ANNOUNCEMENT_LINE_MAX_LENGTH)) {
    return `Satu poin maksimal ${ANNOUNCEMENT_LINE_MAX_LENGTH} karakter.`;
  }
  const href = form.href.trim();
  if (href && !(href.startsWith("/") && !href.startsWith("//"))) {
    return "Tautan harus berupa path di dalam aplikasi, misalnya /dashboard/settings.";
  }
  return null;
}

export default function AnnouncementsPage() {
  const [rows, setRows] = useState<AnnouncementRow[]>([]);
  const [pendingChangelog, setPendingChangelog] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<AnnouncementRow | null>(null);
  const [deleting, setDeleting] = useState(false);

  async function load() {
    try {
      const response = await fetch("/api/admin/announcements", { cache: "no-store" });
      const payload = await response.json() as {
        data?: AnnouncementRow[];
        meta?: { pendingChangelog?: number };
        error?: string;
      };
      if (!response.ok) throw new Error(payload.error || "Gagal memuat daftar pengumuman.");
      setRows(payload.data ?? []);
      setPendingChangelog(payload.meta?.pendingChangelog ?? 0);
      setLoadError(null);
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "Gagal memuat daftar pengumuman.");
    } finally {
      setLoading(false);
    }
  }

  const loadEffect = useEffectEvent(load);

  useEffect(() => {
    void loadEffect();
  }, []);

  const openCreate = () => {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setDialogOpen(true);
  };

  const openEdit = (row: AnnouncementRow) => {
    setEditingId(row.id);
    setForm({
      title: row.title,
      body: row.body,
      version: row.version ?? "",
      href: row.href ?? "",
      publish: row.status === "PUBLISHED",
    });
    setDialogOpen(true);
  };

  async function submit() {
    const problem = validate(form);
    if (problem) {
      toast.error(problem);
      return;
    }

    setSaving(true);
    try {
      const response = await fetch(
        editingId ? `/api/admin/announcements/${editingId}` : "/api/admin/announcements",
        {
          method: editingId ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title: form.title.trim(),
            body: form.body,
            version: form.version.trim() || null,
            href: form.href.trim() || null,
            publish: form.publish,
          }),
        },
      );
      if (!response.ok) {
        const payload = await response.json().catch(() => null) as { error?: string } | null;
        throw new Error(payload?.error || "Gagal menyimpan pengumuman.");
      }
      toast.success(
        form.publish
          ? "Pengumuman tayang. Pengguna melihatnya sekali saat membuka dashboard."
          : "Draf tersimpan. Belum ada yang melihatnya.",
      );
      setDialogOpen(false);
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Gagal menyimpan pengumuman.");
    } finally {
      setSaving(false);
    }
  }

  async function togglePublished(row: AnnouncementRow, publish: boolean) {
    setBusyId(row.id);
    try {
      const response = await fetch(`/api/admin/announcements/${row.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: row.title,
          body: row.body,
          version: row.version,
          href: row.href,
          publish,
        }),
      });
      if (!response.ok) throw new Error("Gagal mengubah status tayang.");
      toast.success(publish ? "Pengumuman ditayangkan." : "Pengumuman ditarik dari tayangan.");
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Gagal mengubah status tayang.");
    } finally {
      setBusyId(null);
    }
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const response = await fetch(`/api/admin/announcements/${deleteTarget.id}`, { method: "DELETE" });
      if (!response.ok) throw new Error("Gagal menghapus pengumuman.");
      toast.success("Pengumuman dihapus.");
      setDeleteTarget(null);
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Gagal menghapus pengumuman.");
    } finally {
      setDeleting(false);
    }
  }

  async function syncChangelog() {
    setSyncing(true);
    try {
      const response = await fetch("/api/admin/announcements/sync", { method: "POST" });
      const payload = await response.json().catch(() => null) as { data?: { imported: number } } | null;
      if (!response.ok) throw new Error("Gagal menarik catatan rilis.");
      const imported = payload?.data?.imported ?? 0;
      toast.success(
        imported > 0
          ? `${imported} draf ditambahkan. Periksa dulu sebelum ditayangkan.`
          : "Tidak ada catatan rilis baru.",
      );
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Gagal menarik catatan rilis.");
    } finally {
      setSyncing(false);
    }
  }

  const previewLines = parseAnnouncementLines(form.body);

  return (
    <div className="space-y-6 pb-12">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-bold sm:text-2xl">
            <BellRing className="size-5 sm:size-6" aria-hidden="true" />
            Pengumuman Pop-up
          </h1>
          <p className="pp-page-description">
            Muncul sekali di dashboard setelah ditayangkan, lalu tidak diulang ke pengguna yang sudah
            menutupnya. Pakai untuk perubahan yang layak diketahui, bukan untuk setiap deploy.
          </p>
        </div>
        <Button onClick={openCreate}>
          <Plus aria-hidden="true" /> Buat pengumuman
        </Button>
      </div>

      {pendingChangelog > 0 ? (
        <div className="flex flex-col gap-3 rounded-xl border border-[var(--pp-ink)] bg-[var(--pp-mint)] p-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm">
            Ada {pendingChangelog} catatan rilis di{" "}
            <code className="rounded border border-[var(--pp-line)] bg-[var(--pp-white)] px-1.5 py-0.5 font-mono text-xs">
              src/lib/changelog.ts
            </code>{" "}
            yang belum masuk. Ditarik sebagai draf, jadi tetap perlu Anda periksa.
          </p>
          <Button variant="outline" onClick={() => void syncChangelog()} disabled={syncing}>
            {syncing ? <LoaderCircle className="animate-spin" aria-hidden="true" /> : <Upload aria-hidden="true" />}
            Tarik sebagai draf
          </Button>
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">
          Tidak ada catatan rilis baru di{" "}
          <code className="rounded border border-[var(--pp-line)] bg-[var(--pp-white)] px-1.5 py-0.5 font-mono text-xs">
            src/lib/changelog.ts
          </code>
          . Tambahkan entri di sana setiap kali ada rilis, lalu tarik sebagai draf.
        </p>
      )}

      <section className="overflow-hidden rounded-xl border border-[var(--pp-line)] bg-[var(--pp-paper)]">
        {loading ? (
          <div className="flex min-h-52 items-center justify-center gap-2 text-sm text-muted-foreground">
            <LoaderCircle className="size-5 animate-spin" aria-hidden="true" /> Memuat pengumuman...
          </div>
        ) : loadError ? (
          <div className="flex min-h-52 flex-col items-center justify-center gap-3 px-6 text-center">
            <p className="font-bold">Daftar pengumuman gagal dimuat</p>
            <p className="max-w-md text-sm text-muted-foreground">{loadError}</p>
            <Button variant="outline" onClick={() => { setLoading(true); void load(); }}>
              <RefreshCw aria-hidden="true" /> Coba lagi
            </Button>
          </div>
        ) : rows.length === 0 ? (
          <div className="flex min-h-52 flex-col items-center justify-center px-6 text-center">
            <BellRing className="mb-3 size-8 text-[var(--pp-ink)]" aria-hidden="true" />
            <p className="font-bold">Belum ada pengumuman</p>
            <p className="mt-1 max-w-md text-sm text-muted-foreground">
              Buat satu untuk memberi tahu perubahan penting, atau tarik catatan rilis dari changelog
              sebagai draf.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-left text-sm">
              <thead className="border-b border-[var(--pp-line)] bg-[var(--pp-mint)] text-xs font-bold uppercase tracking-[0.08em] text-[var(--pp-ink)]">
                <tr>
                  <th className="px-5 py-3">Judul</th>
                  <th className="px-5 py-3">Status</th>
                  <th className="px-5 py-3">Sumber</th>
                  <th className="px-5 py-3">Tayang</th>
                  <th className="px-5 py-3 text-right">Aksi</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr
                    key={row.id}
                    className="border-b border-[var(--pp-line)] last:border-b-0 hover:bg-[color-mix(in_srgb,var(--pp-highlight)_14%,transparent)]"
                  >
                    <td className="px-5 py-4">
                      <p className="font-semibold">{row.title}</p>
                      <p className="mt-1 font-mono text-xs text-muted-foreground">
                        {row.version ? `v${row.version} · ` : ""}
                        {row.createdBy?.email ?? "tidak diketahui"}
                      </p>
                    </td>
                    <td className="px-5 py-4">
                      <Badge variant="outline" className={STATUS_TONE[row.status]}>
                        {row.status === "PUBLISHED" ? "Tayang" : "Draf"}
                      </Badge>
                    </td>
                    <td className="px-5 py-4">
                      <span className="text-xs font-semibold text-muted-foreground">
                        {row.source === "AUTO" ? "Otomatis" : "Manual"}
                      </span>
                    </td>
                    <td className="px-5 py-4 text-xs text-muted-foreground">
                      {row.publishedAt ? new Date(row.publishedAt).toLocaleString("id-ID") : "Belum tayang"}
                    </td>
                    <td className="px-5 py-4">
                      <div className="flex flex-wrap items-center justify-end gap-2">
                        <Button
                          size="sm"
                          variant={row.status === "PUBLISHED" ? "outline" : "default"}
                          disabled={busyId === row.id}
                          onClick={() => void togglePublished(row, row.status !== "PUBLISHED")}
                        >
                          {row.status === "PUBLISHED" ? "Tarik" : "Tayangkan"}
                        </Button>
                        <Button
                          size="icon-sm"
                          variant="ghost"
                          aria-label={`Ubah ${row.title}`}
                          onClick={() => openEdit(row)}
                        >
                          <Pencil aria-hidden="true" />
                        </Button>
                        <Button
                          size="icon-sm"
                          variant="ghost"
                          aria-label={`Hapus ${row.title}`}
                          onClick={() => setDeleteTarget(row)}
                        >
                          <Trash2 aria-hidden="true" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <Dialog open={dialogOpen} onOpenChange={(next) => { if (!next && !saving) setDialogOpen(false); }}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-[560px]">
          <DialogHeader>
            <DialogTitle>{editingId ? "Ubah pengumuman" : "Pengumuman baru"}</DialogTitle>
            <DialogDescription>
              Satu poin per baris. Ringkas, karena popup ini menyela pekerjaan pengguna.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="announcement-title">Judul</Label>
              <Input
                id="announcement-title"
                value={form.title}
                maxLength={ANNOUNCEMENT_TITLE_MAX_LENGTH}
                onChange={(event) => setForm({ ...form, title: event.target.value })}
                placeholder="Notifikasi sesi via browser"
              />
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="announcement-body">Isi</Label>
                <span className="font-mono text-xs text-muted-foreground">
                  {previewLines.length}/{ANNOUNCEMENT_MAX_LINES} poin
                </span>
              </div>
              <Textarea
                id="announcement-body"
                value={form.body}
                rows={4}
                onChange={(event) => setForm({ ...form, body: event.target.value })}
                placeholder={"Dashboard bisa kirim notifikasi browser saat sesi WA terputus.\nAktifkan di Pengaturan, Notifikasi."}
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="announcement-version">Versi (opsional)</Label>
                <Input
                  id="announcement-version"
                  value={form.version}
                  maxLength={32}
                  onChange={(event) => setForm({ ...form, version: event.target.value })}
                  placeholder="1.4.0"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="announcement-href">Tautan detail (opsional)</Label>
                <Input
                  id="announcement-href"
                  value={form.href}
                  onChange={(event) => setForm({ ...form, href: event.target.value })}
                  placeholder="/dashboard/settings"
                />
              </div>
            </div>

            {/* The switch alone is 18px tall, so the whole row is the label and
                the whole row toggles it. That keeps the tap target on mobile. */}
            <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-[var(--pp-line)] p-3">
              <Switch
                checked={form.publish}
                onCheckedChange={(checked) => setForm({ ...form, publish: checked })}
                className="mt-0.5"
              />
              <span className="block">
                <span className="block text-sm font-semibold">Tayangkan sekarang</span>
                <span className="mt-1 block text-xs text-muted-foreground">
                  {editingId && form.publish
                    ? "Mengubah pengumuman yang sudah tayang tidak memunculkan ulang popup ke pengguna yang sudah menutupnya."
                    : "Pengguna melihatnya sekali saat membuka dashboard. Draf tidak terlihat siapa pun."}
                </span>
              </span>
            </label>

            {/* The popup is narrow on a phone. Seeing the bullets wrap here is
                the only way to catch a wall of text before it interrupts people. */}
            <div className="rounded-lg border border-[var(--pp-line)] bg-[var(--pp-white)] p-4">
              <p className="pp-eyebrow mb-2">Pratinjau</p>
              <p className="font-bold">{form.title || "Judul pengumuman"}</p>
              <p className="mt-1 text-xs text-muted-foreground">
                {form.version ? `Yang baru di PesanPro, versi ${form.version}.` : "Yang baru di PesanPro."}
              </p>
              <ul className="mt-3 space-y-2 text-sm">
                {(previewLines.length > 0 ? previewLines : ["Poin pertama", "Poin kedua"]).map((line, index) => (
                  <li key={`${index}-${line}`} className="flex gap-2">
                    <span aria-hidden="true" className="mt-[7px] size-1.5 shrink-0 rounded-full bg-[var(--pp-ink)]" />
                    <span className="min-w-0 break-words">{line}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          <DialogFooter>
            <Button variant="ghost" onClick={() => setDialogOpen(false)} disabled={saving}>
              Batal
            </Button>
            <Button onClick={() => void submit()} disabled={saving}>
              {saving ? <LoaderCircle className="animate-spin" aria-hidden="true" /> : null}
              {form.publish
                ? editingId ? "Simpan dan tetap tayang" : "Simpan dan tayangkan"
                : "Simpan draf"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteTarget} onOpenChange={(next) => { if (!next && !deleting) setDeleteTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Hapus pengumuman ini?</AlertDialogTitle>
            <AlertDialogDescription>
              Pengguna yang belum sempat melihatnya tidak akan menerimanya lagi. Menarik dari tayangan
              menyimpan isinya, menghapus tidak.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Batal</AlertDialogCancel>
            <AlertDialogAction
              disabled={deleting}
              onClick={(event) => { event.preventDefault(); void confirmDelete(); }}
              className="bg-[var(--pp-danger)] hover:bg-[var(--pp-danger)]"
            >
              {deleting ? "Menghapus..." : "Hapus"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
