"use client";
import { RefObject, useEffect, useRef } from "react";

export interface GestureHandlers {
  /** A single tap (fires immediately; a second tap then calls onDoubleTap instead). */
  onTap: () => void;
  onDoubleTap: (xFraction: number) => void;
  /** While dragging sideways: dx is a fraction of the width, progress 0..1 towards the commit threshold. null = ended. */
  onSwipeProgress: (p: { dx: number; progress: number } | null) => void;
  /** On release after a sideways drag. commit = far enough or a quick flick. */
  onSwipe: (dx: number, commit: boolean) => void;
  /** Vertical drag: volume change as a fraction of full range (already accumulated to whole 1% steps). */
  onVolume: (delta: number) => void;
}

const NO_GESTURE = "button,input,textarea,select,a,label,[data-no-gesture]";
const AXIS_SLOP = 12; // px before a drag picks horizontal or vertical
const TAP_SLOP = 10;
const DOUBLE_TAP_MS = 320;

/**
 * Finger gestures on the video area: horizontal swipe, vertical volume drag, tap, double-tap.
 * Handlers are read through a ref so they always see the latest state without re-binding listeners.
 */
export function usePlayerGestures(ref: RefObject<HTMLElement | null>, handlers: GestureHandlers) {
  const hr = useRef(handlers);
  hr.current = handlers;

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    interface G { id: number; x0: number; y0: number; lastY: number; t0: number; axis: null | "x" | "y"; cancelled: boolean; volAcc: number }
    let g: G | null = null;
    let lastTap = { t: 0, x: 0, y: 0 };

    const down = (e: PointerEvent) => {
      if (e.pointerType === "mouse" && e.button !== 0) return;
      if (g && g.id !== e.pointerId) { g.cancelled = true; hr.current.onSwipeProgress(null); return; } // second finger = cancel
      if ((e.target as Element).closest?.(NO_GESTURE)) return;
      if (e.pointerType === "mouse") el.setPointerCapture(e.pointerId); // touch is captured implicitly
      g = { id: e.pointerId, x0: e.clientX, y0: e.clientY, lastY: e.clientY, t0: performance.now(), axis: null, cancelled: false, volAcc: 0 };
    };

    const move = (e: PointerEvent) => {
      if (!g || e.pointerId !== g.id || g.cancelled) return;
      const dx = e.clientX - g.x0;
      const dy = e.clientY - g.y0;
      if (!g.axis) {
        if (Math.hypot(dx, dy) < AXIS_SLOP) return;
        g.axis = Math.abs(dx) > Math.abs(dy) ? "x" : "y";
      }
      const r = el.getBoundingClientRect();
      if (g.axis === "y") {
        g.volAcc += (g.lastY - e.clientY) / (r.height * 0.7); // finger up = louder; ~70% of the height = full range
        const n = Math.trunc(g.volAcc * 100);
        if (n !== 0) { hr.current.onVolume(n / 100); g.volAcc -= n / 100; }
        g.lastY = e.clientY;
      } else {
        const threshold = Math.max(60, r.width * 0.14);
        hr.current.onSwipeProgress({ dx: dx / r.width, progress: Math.min(1, Math.abs(dx) / threshold) });
      }
    };

    const up = (e: PointerEvent) => {
      if (!g || e.pointerId !== g.id) return;
      const cur = g;
      g = null;
      hr.current.onSwipeProgress(null);
      if (cur.cancelled) return;
      const r = el.getBoundingClientRect();
      const dx = e.clientX - cur.x0;
      const dy = e.clientY - cur.y0;
      const dt = Math.max(1, performance.now() - cur.t0);

      if (cur.axis === "x") {
        const far = Math.abs(dx) > Math.max(60, r.width * 0.14);
        const flick = Math.abs(dx) > 40 && Math.abs(dx) / dt > 0.5; // px per ms
        hr.current.onSwipe(dx / r.width, far || flick);
        return;
      }
      if (cur.axis === "y") return;
      if (dt > 450 || Math.hypot(dx, dy) > TAP_SLOP) return;

      const now = performance.now();
      if (now - lastTap.t < DOUBLE_TAP_MS && Math.hypot(e.clientX - lastTap.x, e.clientY - lastTap.y) < 70) {
        lastTap.t = 0;
        hr.current.onDoubleTap((e.clientX - r.left) / r.width);
        return;
      }
      lastTap = { t: now, x: e.clientX, y: e.clientY };
      hr.current.onTap();
    };

    const cancel = (e: PointerEvent) => {
      if (g && e.pointerId === g.id) { g = null; hr.current.onSwipeProgress(null); }
    };
    const ctx = (e: Event) => e.preventDefault(); // no long-press menu on the picture

    el.addEventListener("pointerdown", down);
    el.addEventListener("pointermove", move);
    el.addEventListener("pointerup", up);
    el.addEventListener("pointercancel", cancel);
    el.addEventListener("contextmenu", ctx);
    return () => {
      el.removeEventListener("pointerdown", down);
      el.removeEventListener("pointermove", move);
      el.removeEventListener("pointerup", up);
      el.removeEventListener("pointercancel", cancel);
      el.removeEventListener("contextmenu", ctx);
    };
  }, [ref]);
}
