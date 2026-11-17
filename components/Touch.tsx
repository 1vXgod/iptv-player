"use client";
import { RefObject, useEffect, useRef, useState } from "react";
import { channelsInGroup } from "@/lib/m3u";
import { useStore, type View } from "@/lib/store";
import { SpeakerIcon } from "./ui";
import { playerRef, toggleMute } from "./VideoPlayer";

/* ------------------------------------------------------------------ helpers */

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

/** Sets store.touch when the last pointer was a finger/pen (and clears it for a mouse). */
export function useTouchDetection() {
  useEffect(() => {
    const { setTouch } = useStore.getState();
    setTouch(window.matchMedia("(pointer: coarse)").matches);
    const on = (e: PointerEvent) => setTouch(e.pointerType !== "mouse");
    window.addEventListener("pointerdown", on, { capture: true, passive: true });
    return () => window.removeEventListener("pointerdown", on, { capture: true });
  }, []);
}

/** Keep the phone's screen on while watching. */
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

const buzz = (ms = 10) => { try { navigator.vibrate?.(ms); } catch { /* unsupported */ } };

/** Send a key to the app exactly as if it was typed (every screen already understands keys). */
export function pressKey(key: string) {
  const a = document.activeElement as HTMLElement | null;
  const target = a && a !== document.body ? a : document.body;
  const init = { key, bubbles: true, cancelable: true };
  target.dispatchEvent(new KeyboardEvent("keydown", init));
  target.dispatchEvent(new KeyboardEvent("keyup", init));
}

function seekBy(sec: number) {
  const v = playerRef.video;
  if (!v || !Number.isFinite(v.duration)) return; // live-converted files can't seek
  v.currentTime = Math.max(0, Math.min(v.duration - 0.5, v.currentTime + sec));
  window.dispatchEvent(new Event("mx-vod-ui"));
}

async function toggleFullscreen() {
  type FsEl = HTMLElement & { webkitRequestFullscreen?: () => Promise<void> };
  const el = document.documentElement as FsEl;
  try {
    if (document.fullscreenElement) {
      await document.exitFullscreen();
      (screen.orientation as ScreenOrientation & { unlock?: () => void })?.unlock?.();
      return;
    }
    await (el.requestFullscreen?.() ?? el.webkitRequestFullscreen?.());
    await (screen.orientation as ScreenOrientation & { lock?: (o: string) => Promise<void> })?.lock?.("landscape");
  } catch { /* not allowed / not supported (iPhone) */ }
}
const canFullscreen = () => typeof document !== "undefined" && !!(document.documentElement.requestFullscreen || (document.documentElement as { webkitRequestFullscreen?: unknown }).webkitRequestFullscreen);

/* ------------------------------------------------------------------ gestures */

type Hint = { label: string; dir: -1 | 1; progress: number } | null;
const emitHint = (hint: Hint) => window.dispatchEvent(new CustomEvent("mx-gesture", { detail: hint }));

const NO_GESTURE = "button,input,textarea,select,a,[data-no-gesture]";
const AXIS_SLOP = 12; // px before a drag picks horizontal or vertical
const TAP_SLOP = 10;
const DOUBLE_TAP_MS = 280;
const LONG_PRESS_MS = 550;

/**
 * Finger gestures on the 16:9 stage (touch / pen only, mouse is untouched):
 *  TV      swipe ◀▶ channel · drag ▲▼ volume · tap info · double-tap mute · hold = channel list
 *  Video   swipe ◀▶ seek · drag ▲▼ volume · tap controls · double-tap sides ∓10 s / centre pause
 *  List    drag ▲▼ scroll · swipe ◀▶ group  (taps on rows are normal clicks)
 */
export function useStageGestures(ref: RefObject<HTMLElement | null>) {
  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    interface G {
      id: number; x0: number; y0: number; lastX: number; lastY: number; t0: number;
      axis: null | "x" | "y"; cancelled: boolean; long: number; volAcc: number; listAcc: number;
    }
    let g: G | null = null;
    let lastTap = { t: 0, x: 0, y: 0, infoBefore: false };

    const st = () => useStore.getState();
    const gestureView = () => { const s = st(); return !s.overlay && (s.view === "tv" || s.view === "list"); };
    const clearLong = () => { if (g) window.clearTimeout(g.long); };

    const down = (e: PointerEvent) => {
      if (e.pointerType === "mouse") return;
      if (g && g.id !== e.pointerId) { g.cancelled = true; clearLong(); emitHint(null); return; } // second finger = cancel
      if (!gestureView()) return;
      if ((e.target as Element).closest?.(NO_GESTURE)) return;
      const cur: G = {
        id: e.pointerId, x0: e.clientX, y0: e.clientY, lastX: e.clientX, lastY: e.clientY,
        t0: performance.now(), axis: null, cancelled: false, long: 0, volAcc: 0, listAcc: 0,
      };
      cur.long = window.setTimeout(() => {
        const s = st();
        if (cur.cancelled || cur.axis || s.view !== "tv" || s.current?.vod) return;
        cur.cancelled = true; // hold on live TV = channel list
        buzz(20);
        s.setView("list");
      }, LONG_PRESS_MS);
      g = cur;
    };

    const move = (e: PointerEvent) => {
      if (!g || e.pointerId !== g.id || g.cancelled) return;
      const dx = e.clientX - g.x0;
      const dy = e.clientY - g.y0;
      if (!g.axis) {
        if (Math.hypot(dx, dy) < AXIS_SLOP) return;
        g.axis = Math.abs(dx) > Math.abs(dy) ? "x" : "y";
        clearLong();
      }
      const r = el.getBoundingClientRect();
      const s = st();
      const vod = !!s.current?.vod;
      if (g.axis === "y") {
        if (s.view === "tv") {
          g.volAcc += (g.lastY - e.clientY) / (r.height * 0.7); // finger up = louder, ~70% of the height = full range
          const n = Math.trunc(g.volAcc * 100);
          if (n !== 0) {
            if (s.muted) toggleMute();
            s.changeVolume(n / 100);
            g.volAcc -= n / 100;
          }
        } else if (s.view === "list") {
          g.listAcc += (g.lastY - e.clientY) / (r.height * 0.0675); // one row = 6.75% of the height
          const n = Math.trunc(g.listAcc);
          if (n !== 0) {
            const len = channelsInGroup(s.channels, s.group).length;
            useStore.setState({ cursor: Math.max(0, Math.min(len - 1, s.cursor + n)) });
            g.listAcc -= n;
          }
        }
      } else {
        const threshold = Math.max(60, r.width * 0.14);
        const progress = Math.min(1, Math.abs(dx) / threshold);
        const dir = dx < 0 ? -1 : 1;
        if (s.view === "tv" && vod) {
          const secs = Math.round((dx / r.width) * 120);
          emitHint({ label: `${secs >= 0 ? "+" : "−"}${Math.abs(secs)} s`, dir, progress: 1 });
        } else if (s.view === "tv") {
          emitHint({ label: dir < 0 ? "Next channel" : "Previous channel", dir, progress });
        } else if (s.view === "list") {
          emitHint({ label: dir < 0 ? "Next group" : "Previous group", dir, progress });
        }
      }
      g.lastX = e.clientX;
      g.lastY = e.clientY;
    };

    const up = (e: PointerEvent) => {
      if (!g || e.pointerId !== g.id) return;
      const cur = g;
      g = null;
      window.clearTimeout(cur.long);
      emitHint(null);
      if (cur.cancelled) return;
      const r = el.getBoundingClientRect();
      const s = st();
      const dx = e.clientX - cur.x0;
      const dy = e.clientY - cur.y0;
      const dt = Math.max(1, performance.now() - cur.t0);

      if (cur.axis === "x") {
        if (s.view === "tv" && s.current?.vod) { seekBy((dx / r.width) * 120); return; }
        const far = Math.abs(dx) > Math.max(60, r.width * 0.14);
        const flick = Math.abs(dx) > 40 && Math.abs(dx) / dt > 0.5; // px per ms
        if (!far && !flick) return;
        const dir = dx < 0 ? 1 : -1; // swipe left = next
        buzz(8);
        if (s.view === "tv") s.zap(dir);
        else if (s.view === "list") s.moveGroup(dir);
        return;
      }
      if (cur.axis === "y") return;

      // ---- a tap (list rows and menu tiles handle their own taps as clicks)
      if (dt > 450 || Math.hypot(dx, dy) > TAP_SLOP || s.view !== "tv") return;
      const vod = !!s.current?.vod;
      const now = performance.now();
      const isDouble = now - lastTap.t < DOUBLE_TAP_MS && Math.hypot(e.clientX - lastTap.x, e.clientY - lastTap.y) < 70;
      if (isDouble) {
        lastTap.t = 0;
        buzz(12);
        if (!vod) {
          s.showInfo(lastTap.infoBefore); // undo the first tap's toggle
          toggleMute();
        } else {
          const third = (e.clientX - r.left) / r.width;
          if (third < 0.34) seekBy(-10);
          else if (third > 0.66) seekBy(10);
          else if (playerRef.video) { const v = playerRef.video; if (v.paused) void v.play().catch(() => {}); else v.pause(); }
        }
        return;
      }
      lastTap = { t: now, x: e.clientX, y: e.clientY, infoBefore: s.infoVisible };
      if (vod) window.dispatchEvent(new Event("mx-vod-ui"));
      else s.showInfo(!s.infoVisible); // instant response; a following second tap undoes it
    };

    const cancel = (e: PointerEvent) => {
      if (g && e.pointerId === g.id) { clearLong(); g = null; emitHint(null); }
    };
    // no long-press text/context menu on the picture (but keep it for text fields)
    const ctx = (e: Event) => {
      if (st().touch && !(e.target as Element).closest?.("input,textarea")) e.preventDefault();
    };

    el.addEventListener("pointerdown", down);
    el.addEventListener("pointermove", move);
    el.addEventListener("pointerup", up);
    el.addEventListener("pointercancel", cancel);
    el.addEventListener("contextmenu", ctx);
    return () => {
      clearLong();
      el.removeEventListener("pointerdown", down);
      el.removeEventListener("pointermove", move);
      el.removeEventListener("pointerup", up);
      el.removeEventListener("pointercancel", cancel);
      el.removeEventListener("contextmenu", ctx);
    };
  }, [ref]);
}

/** Pill that follows a horizontal swipe ("Next channel ›"), so the gesture never feels blind. */
export function GestureHint() {
  const [hint, setHint] = useState<Hint>(null);
  useEffect(() => {
    const on = (e: Event) => setHint((e as CustomEvent<Hint>).detail);
    window.addEventListener("mx-gesture", on);
    return () => window.removeEventListener("mx-gesture", on);
  }, []);
  if (!hint) return null;
  return (
    <div
      className="pointer-events-none absolute left-1/2 top-[38%] z-40 flex -translate-x-1/2 items-center gap-[1.2cqw] rounded-full bg-black/70 px-[2.4cqw] py-[1.2cqw] text-[2.4cqw] font-semibold text-white shadow-lg"
      style={{ opacity: 0.35 + hint.progress * 0.65, transform: `translateX(calc(-50% + ${hint.dir * (1 - hint.progress) * -2}cqw))` }}
    >
      {hint.dir < 0 ? <span className="text-[#5fdcff]">‹</span> : null}
      <span>{hint.label}</span>
      {hint.dir > 0 ? <span className="text-[#5fdcff]">›</span> : null}
    </div>
  );
}

/* --------------------------------------------------------------- on-screen remote */

const EXTRAS: Partial<Record<View, { label: string; key: string }[]>> = {
  tv: [{ label: "Info", key: "i" }, { label: "List", key: "l" }, { label: "Record", key: "r" }, { label: "Stats", key: "s" }],
  list: [{ label: "Info", key: "i" }],
  manager: [{ label: "Delete", key: "d" }, { label: "Reset", key: "r" }, { label: "Play", key: "p" }],
  pvr: [{ label: "Record", key: "n" }, { label: "Timer", key: "t" }, { label: "Delete", key: "d" }],
  ca: [{ label: "Refresh", key: "r" }],
  files: [{ label: "Up", key: "Backspace" }],
};

const u = (n: number) => `calc(var(--u) * ${n})`;

/** A button that fires on touch-down (no 300 ms delay), never steals focus, and can auto-repeat when held. */
function PadKey({ onPress, repeat = false, children, style, className = "", label }: {
  onPress: () => void; repeat?: boolean; children: React.ReactNode; style?: React.CSSProperties; className?: string; label: string;
}) {
  const timer = useRef(0);
  const interval = useRef(0);
  const stop = () => { window.clearTimeout(timer.current); window.clearInterval(interval.current); };
  useEffect(() => stop, []);
  return (
    <div
      role="button"
      aria-label={label}
      data-no-gesture
      onPointerDown={(e) => {
        e.preventDefault(); // keeps focus (and any open text field) where it was
        e.currentTarget.setPointerCapture?.(e.pointerId);
        stop();
        buzz(8);
        onPress();
        if (repeat) timer.current = window.setTimeout(() => { interval.current = window.setInterval(onPress, 110); }, 380);
      }}
      onPointerUp={stop}
      onPointerCancel={stop}
      onLostPointerCapture={stop}
      onContextMenu={(e) => e.preventDefault()}
      className={`flex select-none items-center justify-center rounded-[calc(var(--u)*1.6)] border border-white/20 bg-[#16213f]/90 font-semibold text-white shadow-md transition-colors duration-75 active:bg-[#16c6f2] active:text-[#062033] ${className}`}
      style={{ touchAction: "none", WebkitTapHighlightColor: "transparent", ...style }}
    >
      {children}
    </div>
  );
}

function RemotePad() {
  const view = useStore((s) => s.view);
  const vod = useStore((s) => !!s.current?.vod);
  const muted = useStore((s) => s.muted);
  const [fs, setFs] = useState(false);
  const [fsOk, setFsOk] = useState(false);
  useEffect(() => {
    setFsOk(canFullscreen());
    const on = () => setFs(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", on);
    return () => document.removeEventListener("fullscreenchange", on);
  }, []);

  const back = () => {
    const s = useStore.getState();
    if (s.view === "tv" && !s.current?.vod && !s.overlay) pressKey("Backspace"); // TV -> menu
    else pressKey("Escape");
  };
  const menu = () => {
    const s = useStore.getState();
    if (s.overlay) s.openOverlay(null);
    if (s.current?.vod) s.exitVod();
    s.setView("home");
  };
  const extras = view === "tv" && vod ? [] : EXTRAS[view] ?? [];
  const cell = { width: u(8.4), height: u(8.4), fontSize: u(3.4) };
  // top row: icon over a short label, so it fits the narrow landscape panel as well as the portrait dock
  const sys = { height: u(7.4), flex: "1 1 0", minWidth: 0, flexDirection: "column", gap: u(0.3), fontSize: u(1.8), lineHeight: 1 } as const;
  const icon = { fontSize: u(3), lineHeight: 1, display: "flex", width: u(3.2), height: u(3.2), alignItems: "center", justifyContent: "center" } as const;

  return (
    <div className="flex flex-col items-center" style={{ gap: u(1.2) }}>
      <div className="flex w-full" style={{ gap: u(1) }}>
        <PadKey label="Back" onPress={back} style={sys}><span style={icon}>⟵</span>Back</PadKey>
        <PadKey label="Menu" onPress={menu} style={sys}><span style={icon}>☰</span>Menu</PadKey>
        <PadKey label={muted ? "Unmute" : "Mute"} onPress={toggleMute} style={sys}>
          <span style={icon}><SpeakerIcon muted={muted} className="h-full w-full" /></span>
          {muted ? "Unmute" : "Mute"}
        </PadKey>
      </div>

      <div className="grid" style={{ gridTemplateColumns: `repeat(3, ${u(8.4)})`, gap: u(1) }}>
        <span />
        <PadKey label="Up" repeat onPress={() => pressKey("ArrowUp")} style={cell}>▲</PadKey>
        <span />
        <PadKey label="Left" repeat={vod} onPress={() => pressKey("ArrowLeft")} style={cell}>◀</PadKey>
        <PadKey label="OK" onPress={() => pressKey("Enter")} style={{ ...cell, fontSize: u(2.6), background: "#1d6fe0" }}>OK</PadKey>
        <PadKey label="Right" repeat={vod} onPress={() => pressKey("ArrowRight")} style={cell}>▶</PadKey>
        <span />
        <PadKey label="Down" repeat onPress={() => pressKey("ArrowDown")} style={cell}>▼</PadKey>
        <span />
      </div>

      {(extras.length > 0 || fsOk) && (
        <div className="flex w-full flex-wrap justify-center" style={{ gap: u(1) }}>
          {extras.map((x) => (
            <PadKey key={x.label} label={x.label} onPress={() => pressKey(x.key)} style={{ height: u(5.6), fontSize: u(2.1), flex: "1 1 0", minWidth: u(9) }}>
              {x.label}
            </PadKey>
          ))}
          {fsOk && (
            <PadKey label="Fullscreen" onPress={toggleFullscreen} style={{ height: u(5.6), fontSize: u(2.1), flex: "1 1 0", minWidth: u(9) }}>
              {fs ? "⤡ Exit" : "⤢ Full"}
            </PadKey>
          )}
        </div>
      )}
    </div>
  );
}

/** Landscape: a floating button on the stage that opens the remote as an overlay. */
export function TouchOverlay() {
  const view = useStore((s) => s.view);
  const [open, setOpen] = useState(false);
  return (
    <>
      {open && (
        <div
          data-no-gesture
          className="mx-fade-in absolute right-[1.5%] top-1/2 z-[45] w-[27%] -translate-y-1/2 rounded-[1.6cqw] border border-white/15 bg-[#0b1224]/90 p-[1.6cqw] shadow-2xl backdrop-blur-sm"
          style={{ ["--u" as string]: "1cqw" }}
        >
          <RemotePad />
        </div>
      )}
      <div
        role="button"
        aria-label={open ? "Hide remote" : "Show remote"}
        data-no-gesture
        onPointerDown={(e) => { e.preventDefault(); buzz(8); setOpen((o) => !o); }}
        className="absolute z-[46] flex select-none items-center justify-center rounded-full border border-white/30 bg-black/55 text-white shadow-lg transition-opacity duration-300"
        style={{
          // lives in the 5% margin to the right of the menu tiles so it never covers anything
          width: "4.4cqw", height: "4.4cqw", fontSize: "2.4cqw", touchAction: "none", right: "0.3%",
          top: open ? "3%" : "44%",
          opacity: open || view !== "tv" ? 0.95 : 0.4,
        }}
      >
        {open ? "✕" : "⌖"}
      </div>
    </>
  );
}

/** Portrait: the stage sits on top and the remote fills the space below it. */
export function RemoteDock() {
  return (
    <div
      data-no-gesture
      className="flex min-h-0 w-full flex-1 flex-col items-center justify-center overflow-hidden px-[4vw] pb-[max(2vh,env(safe-area-inset-bottom))] pt-[1.5vh]"
      style={{ ["--u" as string]: "min(2.3vw, 9px)", touchAction: "none", background: "linear-gradient(180deg,#0b1224,#050810)" }}
    >
      <div className="w-full max-w-[460px]">
        <RemotePad />
      </div>
      <div className="mt-[1.6vh] text-center text-[3vw] text-white/45">Rotate your phone for a bigger picture</div>
    </div>
  );
}
