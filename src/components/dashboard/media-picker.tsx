"use client";

import { useEffect, useId, useRef, useState } from "react";
import { FileImage, FileText, FileUp, Loader2, RefreshCw, X } from "lucide-react";
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

export function formatBytes(value: string | undefined) {
  const bytes = Number(value);
  if (!Number.isFinite(bytes) || bytes <= 0) return null;
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export async function readMediaEnvelope<T>(response: Response): Promise<Envelope<T>> {
  const raw = await response.text();
  try {
    return JSON.parse(raw) as Envelope<T>;
  } catch {
    throw new Error(response.ok
      ? "Respons server tidak dapat dibaca"
      : `Server menolak permintaan (${response.status})`);
  }
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
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const provisionalUploads = useRef(new Set<string>());
  const [meta, setMeta] = useState<PrivateMediaDto | null>(null);
  const [state, setState] = useState<LoadState>("idle");
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const busy = state === "loading" || state === "uploading";

  useEffect(() => {
    if (!value) {
      setMeta(null);
      setError(null);
      setState("idle");
      return;
    }
    let cancelled = false;
    setState("loading");
    setError(null);
    void (async () => {
      try {
        const response = await fetch(`/api/v1/media/${encodeURIComponent(value)}?metadata=1`, { cache: "no-store" });
        const payload = await readMediaEnvelope<PrivateMediaDto>(response);
        if (!response.ok || !payload.data) throw new Error(payload.error?.message || "Media tidak dapat dimuat");
        if (!cancelled) setMeta(payload.data);
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
  }, [value, reloadKey]);

  const cleanupProvisional = (mediaId: string) => {
    if (!provisionalUploads.current.delete(mediaId)) return;
    void fetch(`/api/v1/media/${encodeURIComponent(mediaId)}`, { method: "DELETE" }).catch(() => undefined);
  };

  const pick = async (file: File | undefined) => {
    if (!file || disabled) return;
    setState("uploading");
    setError(null);
    try {
      const form = new FormData();
      form.set("file", file);
      const response = await fetch("/api/v1/media", { method: "POST", body: form });
      const payload = await readMediaEnvelope<PrivateMediaDto>(response);
      if (!response.ok || !payload.data) throw new Error(payload.error?.message || "Unggahan media gagal");
      const previousValue = value;
      provisionalUploads.current.add(payload.data.id);
      setMeta(payload.data);
      onChange(payload.data.id);
      if (previousValue && previousValue !== payload.data.id) cleanupProvisional(previousValue);
    } catch (err) {
      setError(errorMessage(err, "Unggahan media gagal"));
    } finally {
      setState("idle");
    }
  };

  const clear = () => {
    const previousValue = value;
    setMeta(null);
    setError(null);
    onChange("");
    if (previousValue) cleanupProvisional(previousValue);
  };

  const openFile = () => inputRef.current?.click();
  const bytes = formatBytes(meta?.sizeBytes);

  return (
    <div className="space-y-2">
      <Label htmlFor={inputId}>{label}</Label>

      <input
        id={inputId}
        ref={inputRef}
        type="file"
        accept={ACCEPT}
        className="sr-only"
        aria-label={label}
        disabled={disabled || busy}
        onChange={(event) => {
          void pick(event.target.files?.[0]);
          event.target.value = "";
        }}
      />

      {value && meta ? (
        <div className="flex items-center gap-3 rounded-lg border border-[var(--pp-line)] bg-white p-2">
          <div className="grid size-11 shrink-0 place-items-center overflow-hidden rounded-md border border-[var(--pp-line)] bg-[var(--pp-paper)]">
            {meta.mimeType.startsWith("image/") ? (
              <FileImage className="size-5 text-[var(--pp-muted)]" aria-hidden="true" />
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
      ) : value && error ? (
        <div className="flex flex-wrap items-center gap-3 rounded-lg border border-[var(--pp-danger)] bg-white p-3">
          <FileText className="size-5 shrink-0 text-[var(--pp-danger)]" aria-hidden="true" />
          <p className="min-w-48 flex-1 text-sm text-[var(--pp-danger)]">Lampiran tersimpan tidak dapat dibaca.</p>
          <Button type="button" variant="outline" size="sm" className="min-h-11" disabled={disabled || busy} onClick={() => setReloadKey((key) => key + 1)}>
            <RefreshCw className="mr-1.5 size-4" aria-hidden="true" /> Coba lagi
          </Button>
          <Button type="button" variant="outline" size="sm" className="min-h-11" disabled={disabled || busy} onClick={openFile}>
            <FileUp className="mr-1.5 size-4" aria-hidden="true" /> Ganti
          </Button>
          <Button type="button" variant="ghost" size="sm" className="min-h-11 text-[var(--pp-danger)]" disabled={disabled || busy} onClick={clear}>
            <X className="mr-1.5 size-4" aria-hidden="true" /> Lepas
          </Button>
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

      {error && !(value && !meta) ? (
        <p className="text-xs font-medium text-[var(--pp-danger)]" role="alert">{error}</p>
      ) : null}
    </div>
  );
}
