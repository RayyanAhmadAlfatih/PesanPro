"use client";

import { useEffect, useRef, useState } from "react";
import { FileText, FileUp, Loader2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";

type PrivateMediaDto = {
  id: string;
  originalName: string;
  mimeType: string;
  mediaType: string;
  sizeBytes: string;
};

type Envelope<T> = { data?: T; error?: { code?: string; message?: string } };

type LoadState = "idle" | "loading" | "uploading";

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

function formatBytes(value: string | undefined) {
  const bytes = Number(value);
  if (!Number.isFinite(bytes) || bytes <= 0) return null;
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function errorMessage(error: unknown, fallback: string) {
  if (error instanceof Error && error.message) return error.message;
  return fallback;
}

export type MediaPickerProps = {
  value: string;
  onChange: (next: string) => void;
  label?: string;
  disabled?: boolean;
};

export function MediaPicker({ value, onChange, label = "Media (opsional)", disabled = false }: MediaPickerProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [meta, setMeta] = useState<PrivateMediaDto | null>(null);
  const [state, setState] = useState<LoadState>("idle");
  const [error, setError] = useState<string | null>(null);
  const [previewBroken, setPreviewBroken] = useState(false);
  const busy = state === "loading" || state === "uploading";

  useEffect(() => {
    setPreviewBroken(false);
    if (!value) {
      setMeta(null);
      setError(null);
      setState("idle");
      return;
    }
    if (meta?.id === value) return;
    let cancelled = false;
    setState("loading");
    setError(null);
    void (async () => {
      try {
        const response = await fetch("/api/v1/media?limit=100", { cache: "no-store" });
        const payload = await response.json() as Envelope<PrivateMediaDto[]>;
        if (!response.ok || !payload.data) throw new Error(payload.error?.message || "Media tidak dapat dimuat");
        const found = payload.data.find((item) => item.id === value);
        if (!found) throw new Error("Media ini sudah dihapus atau bukan milik workspace ini");
        if (!cancelled) setMeta(found);
      } catch (err) {
        if (!cancelled) {
          setMeta(null);
          setError(errorMessage(err, "Media tidak dapat dimuat"));
        }
      } finally {
        if (!cancelled) setState("idle");
      }
    })();
    return () => { cancelled = true; };
  }, [value, meta]);

  const pick = async (file: File | undefined) => {
    if (!file || disabled) return;
    setState("uploading");
    setError(null);
    try {
      const form = new FormData();
      form.set("file", file);
      const response = await fetch("/api/v1/media", { method: "POST", body: form });
      const payload = await response.json() as Envelope<PrivateMediaDto>;
      if (!response.ok || !payload.data) throw new Error(payload.error?.message || "Unggahan media gagal");
      setMeta(payload.data);
      onChange(payload.data.id);
    } catch (err) {
      setError(errorMessage(err, "Unggahan media gagal"));
    } finally {
      setState("idle");
    }
  };

  const clear = () => {
    setMeta(null);
    setError(null);
    setPreviewBroken(false);
    onChange("");
  };

  const openFile = () => inputRef.current?.click();
  const bytes = formatBytes(meta?.sizeBytes);

  return (
    <div className="space-y-2">
      <Label>{label}</Label>

      <input
        ref={inputRef}
        type="file"
        accept={ACCEPT}
        className="sr-only"
        tabIndex={-1}
        aria-hidden="true"
        disabled={disabled || busy}
        onChange={(event) => {
          void pick(event.target.files?.[0]);
          event.target.value = "";
        }}
      />

      {value && meta ? (
        <div className="flex items-center gap-3 rounded-lg border border-[var(--pp-line)] bg-white p-2">
          <div className="grid size-11 shrink-0 place-items-center overflow-hidden rounded-md border border-[var(--pp-line)] bg-[var(--pp-paper)]">
            {meta.mimeType.startsWith("image/") && !previewBroken ? (
              <img
                src={`/api/v1/media/${meta.id}`}
                alt=""
                className="size-full object-cover"
                onError={() => setPreviewBroken(true)}
              />
            ) : (
              <FileText className="size-5 text-[var(--pp-muted)]" aria-hidden="true" />
            )}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold" title={meta.originalName}>{meta.originalName}</p>
            <p className="truncate text-xs text-[var(--pp-muted)]">
              {[bytes, meta.mediaType.toLowerCase()].filter(Boolean).join(" · ")}
            </p>
          </div>
          <Button type="button" variant="outline" size="sm" className="min-h-11" disabled={disabled || busy} onClick={openFile}>
            {state === "uploading" ? <Loader2 className="mr-1.5 size-4 animate-spin" aria-hidden="true" /> : null}
            Ganti
          </Button>
          <Button type="button" variant="ghost" size="sm" className="min-h-11 text-[var(--pp-danger)]" disabled={disabled || busy} onClick={clear} aria-label="Lepas lampiran media">
            <X className="size-4" aria-hidden="true" />
          </Button>
        </div>
      ) : value && state === "loading" ? (
        <div className="flex min-h-11 items-center gap-2 rounded-lg border border-[var(--pp-line)] bg-white px-3 text-sm text-[var(--pp-muted)]">
          <Loader2 className="size-4 animate-spin" aria-hidden="true" />
          Membaca media...
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-3 rounded-lg border border-dashed border-[var(--pp-line)] bg-white p-3">
          <Button type="button" variant="outline" className="min-h-11" disabled={disabled || busy} onClick={openFile}>
            {state === "uploading" ? <Loader2 className="mr-1.5 size-4 animate-spin" aria-hidden="true" /> : <FileUp className="mr-1.5 size-4" aria-hidden="true" />}
            {state === "uploading" ? "Mengunggah..." : "Pilih file"}
          </Button>
          <p className="min-w-0 flex-1 text-xs text-[var(--pp-muted)]">
            Gambar (JPEG, PNG, WebP), video MP4, audio, atau dokumen PDF dan Office.
          </p>
        </div>
      )}

      {error ? (
        <p className="text-xs font-medium text-[var(--pp-danger)]" role="alert">{error}</p>
      ) : null}
    </div>
  );
}
