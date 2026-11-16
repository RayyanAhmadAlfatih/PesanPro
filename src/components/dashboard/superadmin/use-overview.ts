"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import type { Overview, Preset } from "./types";

/**
 * Satu sumber data untuk semua sub-halaman SuperAdmin.
 * Endpoint yang sama dengan dulu: GET /api/admin/operations/overview.
 */
export function useSuperadminOverview(initialPreset: Preset = "THIS_MONTH") {
  const [data, setData] = useState<Overview | null>(null);
  const [loading, setLoading] = useState(true);
  const [preset, setPreset] = useState<Preset>(initialPreset);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  const load = useCallback(async (nextPreset: Preset = preset, nextFrom = from, nextTo = to): Promise<Overview | null> => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ preset: nextPreset });
      if (nextPreset === "CUSTOM" && nextFrom) params.set("from", nextFrom);
      if (nextPreset === "CUSTOM" && nextTo) params.set("to", nextTo);
      const response = await fetch(`/api/admin/operations/overview?${params.toString()}`, { cache: "no-store" });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Data SuperAdmin tidak bisa dimuat.");
      const overview = body.data as Overview;
      setData(overview);
      return overview;
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Data SuperAdmin tidak bisa dimuat.");
      return null;
    } finally {
      setLoading(false);
    }
  }, [preset, from, to]);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
    // Muat sekali saat halaman dibuka; pemuatan ulang lewat load().
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const applyPreset = (value: Preset) => {
    setPreset(value);
    if (value !== "CUSTOM") void load(value, from, to);
  };

  return { data, setData, loading, preset, from, to, setFrom, setTo, load, applyPreset };
}
