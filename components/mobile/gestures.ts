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
  /** True while the picture is turned sideways by the app (software "rotate screen"): finger moves are mapped into it. */
  isRotated?: () => boolean;
}

const NO_GESTURE = "button,input,textarea,select,a,label,[data-no-gesture]";
const AXIS_SLOP = 12; // px before a drag picks horizontal or vertical
const TAP_SLOP = 10;
const DOUBLE_TAP_MS = 320;

/**
 * Finger gestures on the video area: horizontal swipe, vertical volume drag, tap, double-tap.
 * Handlers are read through a ref so they always see the latest state without re-binding listeners.
 * Positions are converted to the element's own axes, so everything also works when it's rotated 90°.
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

    // The element is rotated 90° clockwise about its top-left corner (see ROTATED_FRAME), so its x axis points down the
    // screen and its y axis points left. The bounding rect of a rotated box is the viewport-space rectangle it covers.
    const local = (e: PointerEvent) => {
      const r = el.getBoundingClientRect();
      return hr.current.isRotated?.()
        ? { x: e.clientY - r.top, y: r.right - e.clientX, w: r.height, h: r.width }
        : { x: e.clientX - r.left, y: e.clientY - r.top, w: r.width, h: r.height };
    };

    const down = (e: PointerEvent) => {
      if (e.pointerType === "mouse" && e.button !== 0) return;
      if (g && g.id !== e.pointerId) { g.cancelled = true; hr.current.onSwipeProgress(null); return; } // second finger = cancel
      if ((e.target as Element).closest?.(NO_GESTURE)) return;
      if (e.pointerType === "mouse") el.setPointerCapture(e.pointerId); // touch is captured implicitly
      const p = local(e);
      g = { id: e.pointerId, x0: p.x, y0: p.y, lastY: p.y, t0: performance.now(), axis: null, cancelled: false, volAcc: 0 };
    };

    const move = (e: PointerEvent) => {
      if (!g || e.pointerId !== g.id || g.cancelled) return;
      const p = local(e);
      const dx = p.x - g.x0;
      const dy = p.y - g.y0;
      if (!g.axis) {
        if (Math.hypot(dx, dy) < AXIS_SLOP) return;
        g.axis = Math.abs(dx) > Math.abs(dy) ? "x" : "y";
      }
      if (g.axis === "y") {
        g.volAcc += (g.lastY - p.y) / (p.h * 0.7); // finger up = louder; ~70% of the height = full range
        const n = Math.trunc(g.volAcc * 100);
        if (n !== 0) { hr.current.onVolume(n / 100); g.volAcc -= n / 100; }
        g.lastY = p.y;
      } else {
        const threshold = Math.max(60, p.w * 0.14);
        hr.current.onSwipeProgress({ dx: dx / p.w, progress: Math.min(1, Math.abs(dx) / threshold) });
      }
    };

    const up = (e: PointerEvent) => {
      if (!g || e.pointerId !== g.id) return;
      const cur = g;
      g = null;
      hr.current.onSwipeProgress(null);
      if (cur.cancelled) return;
      const p = local(e);
      const dx = p.x - cur.x0;
      const dy = p.y - cur.y0;
      const dt = Math.max(1, performance.now() - cur.t0);

      if (cur.axis === "x") {
        const far = Math.abs(dx) > Math.max(60, p.w * 0.14);
        const flick = Math.abs(dx) > 40 && Math.abs(dx) / dt > 0.5; // px per ms
        hr.current.onSwipe(dx / p.w, far || flick);
        return;
      }
      if (cur.axis === "y") return;
      if (dt > 450 || Math.hypot(dx, dy) > TAP_SLOP) return;

      const now = performance.now();
      if (now - lastTap.t < DOUBLE_TAP_MS && Math.hypot(p.x - lastTap.x, p.y - lastTap.y) < 70) {
        lastTap.t = 0;
        hr.current.onDoubleTap(p.x / p.w);
        return;
      }
      lastTap = { t: now, x: p.x, y: p.y };
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
