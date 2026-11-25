"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  Eye,
  FileText,
  FileUp,
  HardDrive,
  Images,
  Loader2,
  RefreshCw,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatBytes as formatPickerBytes } from "./media-picker";
import { formatPlanStorage } from "@/lib/plan-storage";

export type MediaItem = {
  id: string;
  originalName: string;
  mimeType: string;
  mediaType: string;
  sizeBytes: string;
  createdAt: string;
};

type UploadPolicy = {
  canUpload: boolean;
  maxUploadBytes: number;
  planName: string | null;
};

type Envelope<T> = { data?: T; error?: { code?: string; message?: string } };

type ListState = "loading" | "ready" | "error";

const ACCEPT = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "video/mp4",
  "audio/mpeg",
  "audio/ogg",
  "audio/mp4",
  "audio/wav",
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "text/plain",
].join(",");

export function formatMediaBytes(value: bigint | number | string | null | undefined): string {
  const bytes = Number(value ?? 0);
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  if (bytes < 1024) return `${Math.round(bytes)} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${Number((bytes / (1024 * 1024)).toFixed(1))} MB`;
  return `${Number((bytes / (1024 * 1024 * 1024)).toFixed(2))} GB`;
}

export function sumMediaBytes(items: Array<{ sizeBytes: string }>): bigint {
  return items.reduce((total, item) => {
    try {
      return total + BigInt(item.sizeBytes);
    } catch {
      return total;
    }
  }, BigInt(0));
}

async function readEnvelope<T>(response: Response): Promise<Envelope<T>> {
  const raw = await response.text();
  try {
    return JSON.parse(raw) as Envelope<T>;
  } catch {
    throw new Error(response.ok
      ? "Respons server tidak dapat dibaca"
      : `Server menolak permintaan (${response.status})`);
  }
}

function messageFrom(error: unknown, fallback: string) {
  return error instanceof Error && error.message ? error.message : fallback;
}

function formatUploadedAt(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("id-ID", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function isImage(item: MediaItem) {
  return item.mimeType.startsWith("image/");
}

// The picker already owns the wording of its upload errors. Reusing its
// formatter keeps the library's rejection message identical for the same file.
function formatUploadBytes(bytes: number) {
  return formatPickerBytes(String(bytes)) ?? formatMediaBytes(bytes);
}

function previewKind(item: MediaItem) {
  if (item.mimeType.startsWith("image/")) return "image";
  if (item.mimeType.startsWith("video/")) return "video";
  if (item.mimeType.startsWith("audio/")) return "audio";
  return "file";
}

export function MediaLibrary({ storageLimitBytes }: { storageLimitBytes: number | null }) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [items, setItems] = useState<MediaItem[]>([]);
  const [listState, setListState] = useState<ListState>("loading");
  const [listError, setListError] = useState<string | null>(null);
  const [policy, setPolicy] = useState<UploadPolicy | null>(null);
  const [policyError, setPolicyError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<MediaItem | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [previewTarget, setPreviewTarget] = useState<MediaItem | null>(null);

  const loadMedia = useCallback(async (silent = false) => {
    if (!silent) setListState("loading");
    try {
      const response = await fetch("/api/v1/media?limit=100", { cache: "no-store" });
      const payload = await readEnvelope<MediaItem[]>(response);
      if (!response.ok || !payload.data) throw new Error(payload.error?.message || "Media tidak dapat dimuat");
      setItems(payload.data);
      setListError(null);
      setListState("ready");
    } catch (error) {
      setListError(messageFrom(error, "Media tidak dapat dimuat"));
      if (!silent) setListState("error");
    }
  }, []);

  const loadPolicy = useCallback(async () => {
    setPolicyError(null);
    try {
      const response = await fetch("/api/media/upload-policy", { cache: "no-store" });
      const payload = await readEnvelope<UploadPolicy>(response);
      if (!response.ok || !payload.data) throw new Error(payload.error?.message || "Batas unggah tidak dapat dimuat");
      setPolicy(payload.data);
    } catch (error) {
      setPolicyError(messageFrom(error, "Batas unggah tidak dapat dimuat"));
    }
  }, []);

  useEffect(() => {
    void loadMedia();
    void loadPolicy();
  }, [loadMedia, loadPolicy]);

  const usedBytes = useMemo(() => sumMediaBytes(items), [items]);
  const usedPercent = storageLimitBytes && storageLimitBytes > 0
    ? Math.min(100, Math.round((Number(usedBytes) / storageLimitBytes) * 100))
    : 0;
  const uploadBlocked = policy !== null && !policy.canUpload;
  const uploadReady = policy !== null && policy.canUpload;
  const uploadDisabled = uploading || !uploadReady;

  const pickFile = () => fileInputRef.current?.click();

  const upload = async (file: File | undefined) => {
    if (!file || uploading) return;
    if (!policy) {
      setUploadError("Batas unggah belum siap. Muat ulang halaman lalu coba lagi.");
      return;
    }
    if (!policy.canUpload) {
      setUploadError("Paket Anda belum aktif. Pilih paket di halaman Billing untuk mengunggah media.");
      return;
    }
    if (file.size > policy.maxUploadBytes) {
      setUploadError(`Ukuran file ${formatUploadBytes(file.size)} melebihi batas paket ${formatUploadBytes(policy.maxUploadBytes)}.`);
      return;
    }

    setUploading(true);
    setUploadError(null);
    try {
      const form = new FormData();
      form.set("file", file);
      const response = await fetch("/api/v1/media", { method: "POST", body: form });
      const payload = await readEnvelope<MediaItem>(response);
      if (!response.ok || !payload.data) throw new Error(payload.error?.message || "Unggahan media gagal");
      setItems((current) => [payload.data as MediaItem, ...current.filter((item) => item.id !== payload.data?.id)]);
      toast.success("Media berhasil diunggah");
      await loadMedia(true);
    } catch (error) {
      setUploadError(messageFrom(error, "Unggahan media gagal"));
    } finally {
      setUploading(false);
    }
  };

  const deleteMedia = async (item: MediaItem) => {
    setBusyId(item.id);
    setDeleteError(null);
    try {
      const response = await fetch(`/api/v1/media/${encodeURIComponent(item.id)}`, { method: "DELETE" });
      const payload = await readEnvelope<MediaItem>(response);
      if (!response.ok) {
        const serverMessage = payload.error?.message || `Media tidak dapat dihapus (${response.status})`;
        // Keep the file visible on 409: the server refused the delete because
        // a workflow still references it, and no quota was released.
        const message = payload.error?.code === "MEDIA_IN_USE"
          ? `Media tidak dihapus: masih dipakai workflow aktif (${serverMessage}). Selesaikan workflow itu lalu coba lagi.`
          : serverMessage;
        setDeleteError(message);
        toast.error(message);
        return;
      }
      setItems((current) => current.filter((media) => media.id !== item.id));
      toast.success("Media dihapus");
      await loadMedia(true);
    } catch (error) {
      setDeleteError(messageFrom(error, "Media tidak dapat dihapus"));
    } finally {
      setBusyId(null);
      setDeleteTarget(null);
    }
  };

  return (
    <div className="space-y-6 pb-12">
      <header className="pp-page-head">
        <div>
          <span className="pp-eyebrow">Aset pengiriman</span>
          <h1 className="pp-page-title">Pustaka Media</h1>
          <p className="pp-page-description">
            Kelola gambar, video, audio, dan dokumen yang dipakai untuk broadcast, jadwal kirim, dan balasan otomatis.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" onClick={pickFile} disabled={uploadDisabled}>
            {uploading ? <Loader2 className="animate-spin" aria-hidden="true" /> : <FileUp aria-hidden="true" />}
            {uploading ? "Mengunggah..." : "Unggah media"}
          </Button>
          <input
            ref={fileInputRef}
            type="file"
            accept={ACCEPT}
            className="sr-only"
            aria-label="Pilih file untuk diunggah ke pustaka media"
            disabled={uploadDisabled}
            onChange={(event) => {
              void upload(event.target.files?.[0]);
              event.target.value = "";
            }}
          />
        </div>
      </header>

      {policyError ? (
        <div role="alert" className="flex flex-wrap items-center gap-3 rounded-lg border border-[var(--pp-danger)] bg-white p-3">
          <AlertTriangle className="size-5 shrink-0 text-[var(--pp-danger)]" aria-hidden="true" />
          <p className="min-w-48 flex-1 text-sm text-[var(--pp-danger)]">{policyError}</p>
          <Button type="button" variant="outline" size="sm" className="min-h-11" onClick={() => void loadPolicy()}>
            <RefreshCw aria-hidden="true" /> Coba lagi
          </Button>
        </div>
      ) : uploadBlocked ? (
        <p className="text-sm font-medium text-[var(--pp-terracotta)]" role="status">
          Paket Anda belum aktif. Pilih paket di halaman Billing untuk mengunggah media.
        </p>
      ) : policy ? (
        <p className="text-xs text-[var(--pp-muted)]" role="status">
          Maksimal {formatMediaBytes(policy.maxUploadBytes)} per file
          {policy.planName ? ` (paket ${policy.planName})` : ""}. Video WhatsApp maksimal 16 MB.
        </p>
      ) : (
        <p className="text-xs text-[var(--pp-muted)]" role="status">Memuat batas unggah...</p>
      )}

      <Card>
        <CardContent className="space-y-3 p-5">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.08em] text-[var(--pp-muted)]">
                <HardDrive className="size-4" aria-hidden="true" /> Pemakaian penyimpanan
              </p>
              <p className="mt-1 text-2xl font-bold tabular-nums" aria-live="polite">
                {formatMediaBytes(usedBytes)}
                <span className="text-sm font-semibold text-[var(--pp-muted)]">
                  {" / "}
                  {storageLimitBytes === null
                    ? "Tanpa batas"
                    : storageLimitBytes > 0
                      ? (formatPlanStorage(storageLimitBytes) ?? formatMediaBytes(storageLimitBytes))
                      : "Tidak termasuk paket aktif"}
                </span>
              </p>
            </div>
            <p className="text-xs text-[var(--pp-muted)]" role="status">{items.length} media aktif</p>
          </div>

          {storageLimitBytes !== null && storageLimitBytes > 0 ? (
            <Progress value={usedPercent} aria-label={`Pemakaian penyimpanan media ${usedPercent} persen`} />
          ) : null}

          <p className="text-xs text-[var(--pp-muted)]">
            Dihitung dari media aktif yang tampil di daftar ini. Daftar menampilkan maksimal 100 media terbaru.
          </p>
        </CardContent>
      </Card>

      {uploadError ? (
        <div role="alert" className="flex items-start gap-3 rounded-lg border border-[var(--pp-danger)] bg-white p-3">
          <AlertTriangle className="mt-0.5 size-5 shrink-0 text-[var(--pp-danger)]" aria-hidden="true" />
          <p className="text-sm text-[var(--pp-danger)]">{uploadError}</p>
        </div>
      ) : null}

      {deleteError ? (
        <div role="alert" className="flex items-start gap-3 rounded-lg border border-[var(--pp-danger)] bg-white p-3">
          <AlertTriangle className="mt-0.5 size-5 shrink-0 text-[var(--pp-danger)]" aria-hidden="true" />
          <p className="text-sm text-[var(--pp-danger)]">{deleteError}</p>
        </div>
      ) : null}

      <Card className="overflow-hidden py-0">
        {listState === "loading" ? (
          <div className="flex min-h-56 items-center justify-center gap-2 text-sm text-[var(--pp-muted)]" role="status">
            <Loader2 className="size-5 animate-spin" aria-hidden="true" /> Memuat media...
          </div>
        ) : listState === "error" ? (
          <div className="flex min-h-56 flex-col items-center justify-center gap-3 px-6 text-center" role="alert">
            <AlertTriangle className="size-8 text-[var(--pp-danger)]" aria-hidden="true" />
            <div>
              <p className="font-bold">Media tidak dapat dimuat</p>
              <p className="mt-1 text-sm text-[var(--pp-muted)]">{listError}</p>
            </div>
            <Button type="button" variant="outline" className="min-h-11" onClick={() => void loadMedia()}>
              <RefreshCw aria-hidden="true" /> Coba lagi
            </Button>
          </div>
        ) : items.length === 0 ? (
          <div className="flex min-h-56 flex-col items-center justify-center gap-3 px-6 text-center">
            <Images className="size-8 text-[var(--pp-ink)]" aria-hidden="true" />
            <div>
              <p className="font-bold">Belum ada media</p>
              <p className="mt-1 text-sm text-[var(--pp-muted)]">
                Unggah gambar, video, audio, atau dokumen pertama untuk dipakai di pengiriman.
              </p>
            </div>
            <Button type="button" variant="outline" className="min-h-11" onClick={pickFile} disabled={uploadDisabled}>
              <FileUp aria-hidden="true" /> Unggah media
            </Button>
          </div>
        ) : (
          <Table>
            <TableHeader className="bg-[var(--pp-mint)]">
              <TableRow>
                <TableHead>Media</TableHead>
                <TableHead>Tipe</TableHead>
                <TableHead>Ukuran</TableHead>
                <TableHead>Diunggah</TableHead>
                <TableHead className="text-right">Aksi</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((item) => {
                const fileHref = `/api/v1/media/${encodeURIComponent(item.id)}`;
                return (
                  <TableRow key={item.id} className="hover:bg-[var(--pp-highlight)]/40">
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <div className="grid size-11 shrink-0 place-items-center overflow-hidden rounded-md border border-[var(--pp-line)] bg-[var(--pp-paper)]">
                          {isImage(item) ? (
                            // The endpoint needs the session cookie, so the Next image optimizer cannot fetch it.
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={fileHref} alt="" loading="lazy" className="size-full object-cover" />
                          ) : (
                            <FileText className="size-5 text-[var(--pp-muted)]" aria-hidden="true" />
                          )}
                        </div>
                        <p className="max-w-[18rem] truncate font-semibold" title={item.originalName}>
                          {item.originalName}
                        </p>
                      </div>
                    </TableCell>
                    <TableCell>
                      <p className="text-sm">{item.mimeType}</p>
                      <p className="mt-0.5 text-xs uppercase tracking-wide text-[var(--pp-muted)]">{item.mediaType}</p>
                    </TableCell>
                    <TableCell className="tabular-nums">{formatMediaBytes(item.sizeBytes)}</TableCell>
                    <TableCell className="text-[var(--pp-muted)]">{formatUploadedAt(item.createdAt)}</TableCell>
                    <TableCell>
                      <div className="flex flex-wrap justify-end gap-2">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="min-h-11"
                          onClick={() => setPreviewTarget(item)}
                          aria-label={`Pratinjau ${item.originalName}`}
                        >
                          <Eye aria-hidden="true" /> Pratinjau
                        </Button>
                        <Button asChild variant="ghost" size="sm" className="min-h-11">
                          <a href={fileHref} download={item.originalName} aria-label={`Unduh ${item.originalName}`}>
                            Unduh
                          </a>
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="min-h-11 text-[var(--pp-danger)]"
                          disabled={busyId === item.id}
                          onClick={() => setDeleteTarget(item)}
                          aria-label={`Hapus ${item.originalName}`}
                        >
                          <Trash2 aria-hidden="true" /> Hapus
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </Card>

      <AlertDialog open={deleteTarget !== null} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Hapus media ini?</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteTarget ? `"${deleteTarget.originalName}" akan dihapus dari pustaka dan kuota penyimpanan dilepas.` : ""}
              {" "}Media yang masih dipakai workflow aktif tidak akan dihapus. Tindakan ini tidak bisa dibatalkan.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Batal</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteTarget && void deleteMedia(deleteTarget)}
              className="bg-red-600 hover:bg-red-700"
            >
              Hapus
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={previewTarget !== null} onOpenChange={(open) => !open && setPreviewTarget(null)}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle className="truncate pr-8">{previewTarget?.originalName ?? "Pratinjau media"}</DialogTitle>
            <DialogDescription>
              {previewTarget
                ? `${previewTarget.mimeType} · ${formatMediaBytes(previewTarget.sizeBytes)} · ${formatUploadedAt(previewTarget.createdAt)}`
                : ""}
            </DialogDescription>
          </DialogHeader>
          {previewTarget ? (() => {
            const href = `/api/v1/media/${encodeURIComponent(previewTarget.id)}`;
            const kind = previewKind(previewTarget);
            return (
              <div className="space-y-3">
                <div className="flex min-h-56 items-center justify-center overflow-hidden rounded-lg border border-[var(--pp-line)] bg-[var(--pp-paper)] p-3">
                  {kind === "image" ? (
                    // The endpoint needs the session cookie, so the Next image optimizer cannot fetch it.
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={href} alt={`Pratinjau ${previewTarget.originalName}`} className="max-h-[60vh] max-w-full object-contain" />
                  ) : kind === "video" ? (
                    <video src={href} controls className="max-h-[60vh] max-w-full" aria-label={`Pratinjau ${previewTarget.originalName}`} />
                  ) : kind === "audio" ? (
                    <audio src={href} controls className="max-w-full" aria-label={`Pratinjau ${previewTarget.originalName}`} />
                  ) : (
                    <div className="px-4 text-center text-sm text-[var(--pp-muted)]">
                      <p className="font-semibold text-[var(--pp-ink)]">Jenis file ini tidak punya pratinjau di browser.</p>
                      <p className="mt-1">Unduh file untuk membukanya di aplikasi yang sesuai.</p>
                    </div>
                  )}
                </div>
                <DialogFooter>
                  <Button asChild variant="outline" className="min-h-11">
                    <a href={href} download={previewTarget.originalName}>Unduh</a>
                  </Button>
                  <DialogClose asChild>
                    <Button type="button" variant="outline" className="min-h-11">Tutup</Button>
                  </DialogClose>
                </DialogFooter>
              </div>
            );
          })() : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}
