"use client";
import { useCallback, useEffect, useState } from "react";
import type { Channel } from "./m3u";
import { absoluteUrl } from "./device";

export interface Rec {
  id: string;
  name: string;
  number?: number;
  mode: "audio" | "video";
  status: "scheduled" | "recording" | "finishing" | "done" | "failed" | "cancelled";
  scheduledStart?: number;
  durationMin?: number;
  start?: number;
  end?: number;
  plannedEnd?: number;
  file?: string;
  size?: number;
  error?: string;
}

/** Record with full conversion only if live playback of this channel needed it. */
function modeFor(url: string): "audio" | "video" {
  try {
    const w = JSON.parse(localStorage.getItem("mirax.strategy") || "{}") as Record<string, string>;
    return /full transcode/.test(w[url] || "") ? "video" : "audio";
  } catch {
    return "audio";
  }
}

async function post(body: object) {
  const r = await fetch("/api/recordings", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || `HTTP ${r.status}`);
  return j;
}

export function startRecording(c: Channel, opts: { startAt?: number; durationMin?: number } = {}) {
  return post({ action: "start", name: c.name, number: c.number, url: absoluteUrl(c.url), mode: modeFor(c.url), ...opts });
}
export const stopRecording = (id: string) => post({ action: "stop", id });
export const deleteRecording = (id: string) => post({ action: "delete", id });
export const recordingUrl = (id: string) => `/api/recordings/${id}/file`;

/** Polls the recordings list (faster while something is recording). */
export function useRecordings(enabled = true) {
  const [recs, setRecs] = useState<Rec[]>([]);
  const [ffmpeg, setFfmpeg] = useState(true);
  const [tick, setTick] = useState(0);
  const refresh = useCallback(() => setTick((t) => t + 1), []);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    let timer = 0;
    const load = async () => {
      try {
        const j = await (await fetch("/api/recordings", { cache: "no-store" })).json();
        if (cancelled) return;
        setRecs(j.recordings || []);
        setFfmpeg(!!j.ffmpeg);
        const busy = (j.recordings || []).some((r: Rec) => r.status === "recording" || r.status === "finishing" || r.status === "scheduled");
        timer = window.setTimeout(load, busy ? 2000 : 8000);
      } catch {
        if (!cancelled) timer = window.setTimeout(load, 8000);
      }
    };
    load();
    return () => { cancelled = true; window.clearTimeout(timer); };
  }, [enabled, tick]);

  return { recs, ffmpeg, refresh };
}

export function fmtBytes(n?: number) {
  if (!n) return "—";
  const u = ["B", "KB", "MB", "GB", "TB"];
  let i = 0;
  while (n >= 1024 && i < u.length - 1) { n /= 1024; i++; }
  return `${n.toFixed(i >= 2 ? 1 : 0)} ${u[i]}`;
}

export function fmtDuration(ms?: number) {
  if (!ms || ms < 0) return "—";
  const s = Math.round(ms / 1000);
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  return h ? `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}` : `${m}:${String(sec).padStart(2, "0")}`;
}
