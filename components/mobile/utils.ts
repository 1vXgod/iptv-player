"use client";
import { type CSSProperties, useEffect, useState } from "react";
import { playerRef } from "../VideoPlayer";

export function useMedia(query: string): boolean {
  const [m, setM] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia(query);
    const f = () => setM(mq.matches);
    f();
    mq.addEventListener("change", f);
    return () => mq.removeEventListener("change", f);
  }, [query]);
  return m;
}

/** Keep the phone's screen on while the app is open and visible. */
export function useWakeLock(enabled: boolean) {
  useEffect(() => {
    if (!enabled || !("wakeLock" in navigator)) return;
    let lock: WakeLockSentinel | null = null;
    let cancelled = false;
    const acquire = async () => {
      try { lock = await navigator.wakeLock.request("screen"); } catch { /* denied / low battery */ }
    };
    void acquire();
    const onVisible = () => { if (document.visibilityState === "visible" && !cancelled) void acquire(); };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVisible);
      lock?.release().catch(() => {});
    };
  }, [enabled]);
}

/**
 * "Rotate screen" for browsers that won't turn the display (iPhone, or Android without fullscreen): the app draws the
 * player turned 90° clockwise about its top-left corner, sized to the swapped screen, so you just turn the phone.
 * Anything `fixed` inside a frame like this is positioned relative to it, so drawers and toasts rotate too.
 */
export const ROTATED_FRAME: CSSProperties = {
  position: "fixed",
  top: 0,
  left: "100vw",
  width: "100dvh",
  height: "100vw",
  transform: "rotate(90deg)",
  transformOrigin: "top left",
};

export const buzz = (ms = 10) => { try { navigator.vibrate?.(ms); } catch { /* unsupported */ } };

export function seekBy(sec: number) {
  const v = playerRef.video;
  if (!v || !Number.isFinite(v.duration)) return; // live / converted streams can't seek
  v.currentTime = Math.max(0, Math.min(v.duration - 0.5, v.currentTime + sec));
}

export function togglePause() {
  const v = playerRef.video;
  if (!v) return;
  if (v.paused) void v.play().catch(() => {}); else v.pause();
}

type FsDoc = Document & { webkitFullscreenElement?: Element; webkitExitFullscreen?: () => Promise<void> };
type FsEl = HTMLElement & { webkitRequestFullscreen?: () => Promise<void> };
type Orient = ScreenOrientation & { lock?: (o: string) => Promise<void>; unlock?: () => void };

/** Enter / leave browser fullscreen and (where allowed) lock landscape. Silently does nothing on iPhone. */
export async function setBrowserFullscreen(on: boolean) {
  const doc = document as FsDoc;
  const el = document.documentElement as FsEl;
  try {
    if (on) {
      if (!doc.fullscreenElement && !doc.webkitFullscreenElement) await (el.requestFullscreen?.() ?? el.webkitRequestFullscreen?.());
      await (screen.orientation as Orient)?.lock?.("landscape");
    } else {
      (screen.orientation as Orient)?.unlock?.();
      if (doc.fullscreenElement || doc.webkitFullscreenElement) await (doc.exitFullscreen?.() ?? doc.webkitExitFullscreen?.());
    }
  } catch { /* not allowed or not supported */ }
}

export function fmtClock(sec: number) {
  if (!Number.isFinite(sec) || sec < 0) sec = 0;
  const s = Math.floor(sec);
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), r = s % 60;
  return h ? `${h}:${String(m).padStart(2, "0")}:${String(r).padStart(2, "0")}` : `${m}:${String(r).padStart(2, "0")}`;
}
