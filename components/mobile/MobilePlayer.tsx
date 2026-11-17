"use client";
import { useEffect, useRef, useState } from "react";
import type { Channel } from "@/lib/m3u";
import { Rec, startRecording, stopRecording } from "@/lib/pvr-client";
import { codecTags, useStore } from "@/lib/store";
import { ChannelLogo, SpeakerIcon } from "../ui";
import VideoPlayer, { playerRef, toggleMute } from "../VideoPlayer";
import { usePlayerGestures } from "./gestures";
import { Icon } from "./icons";
import { buzz, fmtClock, seekBy, togglePause } from "./utils";

/* ------------------------------------------------------------------ shared pieces */

export interface RecCtx { recs: Rec[]; refresh: () => void; say: (m: string) => void }

export const recordingOf = (recs: Rec[], c: Channel | null) =>
  c && !c.vod ? recs.find((r) => r.status === "recording" && r.name === c.name && r.number === c.number) : undefined;

export async function toggleRecord(c: Channel, ctx: RecCtx) {
  const mine = recordingOf(ctx.recs, c);
  try {
    if (mine) { await stopRecording(mine.id); ctx.say("Recording saved"); }
    else { await startRecording(c); ctx.say(`Recording ${c.name}`); }
  } catch (e) { ctx.say((e as Error).message); }
  ctx.refresh();
}

/** Playback position of the current <video> (recordings / files). */
export function useVideoTime() {
  const tune = useStore((s) => s.tuneNonce);
  const [t, setT] = useState({ pos: 0, dur: 0, paused: false });
  useEffect(() => {
    const v = playerRef.video;
    if (!v) return;
    const upd = () => setT({ pos: v.currentTime, dur: Number.isFinite(v.duration) ? v.duration : 0, paused: v.paused });
    upd();
    const evs = ["timeupdate", "durationchange", "play", "pause", "seeked", "loadedmetadata"];
    evs.forEach((e) => v.addEventListener(e, upd));
    return () => evs.forEach((e) => v.removeEventListener(e, upd));
  }, [tune]);
  return t;
}

export function SeekBar() {
  const { pos, dur } = useVideoTime();
  return (
    <div className="flex items-center gap-3 text-xs tabular-nums text-white/85">
      <span className="w-11 text-right">{fmtClock(pos)}</span>
      <input
        type="range"
        aria-label="Seek"
        min={0}
        max={dur || 1}
        step={0.5}
        value={Math.min(pos, dur || 1)}
        disabled={!dur}
        onChange={(e) => { const v = playerRef.video; if (v) v.currentTime = Number(e.target.value); }}
        className="h-9 min-w-0 flex-1 accent-[#16c6f2]"
      />
      <span className="w-11">{dur ? fmtClock(dur) : "live"}</span>
    </div>
  );
}

export function ChannelBadge({ c, size = 44 }: { c: Channel | null; size?: number }) {
  return (
    <div className="flex shrink-0 items-center justify-center rounded-xl bg-white/10 p-1.5" style={{ width: size, height: size }}>
      <ChannelLogo src={c?.logo} className="max-h-full max-w-full" fallback={<Icon name={c?.vod ? "film" : "tv"} className="h-5 w-5 text-white/60" />} />
    </div>
  );
}

/* ------------------------------------------------------------------ the player */

export default function MobilePlayer({ full, canExit, onToggleFull, onOpenChannels, rec }: {
  full: boolean; canExit: boolean; onToggleFull: () => void; onOpenChannels: () => void; rec: RecCtx;
}) {
  const boxRef = useRef<HTMLDivElement>(null);
  const current = useStore((s) => s.current);
  const tech = useStore((s) => s.tech);
  const volume = useStore((s) => s.volume);
  const muted = useStore((s) => s.muted);
  const volNonce = useStore((s) => s.volumeNonce);
  const vod = !!current?.vod;
  const { paused } = useVideoTime();

  const [controls, setControls] = useState(false);
  const [ping, setPing] = useState(0);
  const prevControls = useRef(false);
  const [hint, setHint] = useState<{ label: string; dir: -1 | 1; progress: number } | null>(null);
  const [showVol, setShowVol] = useState(false);
  const firstVol = useRef(true);
  const mine = recordingOf(rec.recs, current);

  // controls fade out by themselves (and stay up while a recording is paused)
  useEffect(() => {
    if (!controls) return;
    const id = window.setTimeout(() => setControls(false), 3500);
    return () => window.clearTimeout(id);
  }, [controls, ping]);
  const show = () => { setControls(true); setPing((n) => n + 1); };

  // the volume pill pops up for a moment on every change
  useEffect(() => {
    if (firstVol.current) { firstVol.current = false; return; }
    setShowVol(true);
    const id = window.setTimeout(() => setShowVol(false), 1500);
    return () => window.clearTimeout(id);
  }, [volNonce, muted]);

  usePlayerGestures(boxRef, {
    onTap: () => { prevControls.current = controls; if (controls) setControls(false); else show(); },
    onDoubleTap: (x) => {
      setControls(prevControls.current); // undo the toggle the first tap did
      buzz(12);
      if (!vod) { toggleMute(); return; }
      if (x < 0.34) seekBy(-10); else if (x > 0.66) seekBy(10); else togglePause();
    },
    onSwipeProgress: (p) => {
      if (!p) { setHint(null); return; }
      const dir = p.dx < 0 ? -1 : 1;
      if (vod) {
        const secs = Math.round(p.dx * 120);
        setHint({ label: `${secs >= 0 ? "+" : "−"}${Math.abs(secs)} s`, dir, progress: 1 });
      } else {
        setHint({ label: dir < 0 ? "Next channel" : "Previous channel", dir, progress: p.progress });
      }
    },
    onSwipe: (dx, commit) => {
      if (vod) { seekBy(dx * 120); return; }
      if (!commit) return;
      buzz(8);
      useStore.getState().zap(dx < 0 ? 1 : -1);
    },
    onVolume: (d) => {
      const s = useStore.getState();
      if (s.muted) toggleMute(); // moving the volume while muted unmutes
      s.changeVolume(d);
    },
  });

  const round = "flex items-center justify-center rounded-full bg-black/55 text-white backdrop-blur-sm transition-transform active:scale-95";
  const zap = (d: number) => { buzz(8); useStore.getState().zap(d); show(); };
  const pad = full
    ? { paddingTop: "max(10px, env(safe-area-inset-top))", paddingLeft: "max(14px, env(safe-area-inset-left))", paddingRight: "max(14px, env(safe-area-inset-right))", paddingBottom: "max(10px, env(safe-area-inset-bottom))" }
    : { padding: 10 };

  return (
    <div
      ref={boxRef}
      className={`${full ? "fixed inset-0 z-40" : "relative w-full shrink-0"} select-none overflow-hidden bg-black`}
      style={{ aspectRatio: full ? undefined : "16 / 9", touchAction: "none" }}
    >
      <VideoPlayer fill />

      {/* swipe hint */}
      {hint && (
        <div
          className="pointer-events-none absolute left-1/2 top-[40%] z-20 flex -translate-x-1/2 items-center gap-2 rounded-full bg-black/75 px-4 py-2 text-[15px] font-semibold text-white shadow-lg"
          style={{ opacity: 0.4 + hint.progress * 0.6 }}
        >
          {hint.dir < 0 && <span className="text-[#5fdcff]">‹</span>}
          {hint.label}
          {hint.dir > 0 && <span className="text-[#5fdcff]">›</span>}
        </div>
      )}

      {/* volume pill */}
      <div
        className={`pointer-events-none absolute left-1/2 top-3 z-20 flex -translate-x-1/2 items-center gap-2.5 rounded-full bg-black/75 px-3.5 py-2 text-white shadow-lg transition-opacity duration-200 ${showVol ? "opacity-100" : "opacity-0"}`}
      >
        <SpeakerIcon muted={muted || volume === 0} className="h-5 w-5" />
        <div className="h-1.5 w-28 overflow-hidden rounded-full bg-white/25">
          <div className="h-full rounded-full bg-[#16c6f2]" style={{ width: `${muted ? 0 : Math.round(volume * 100)}%`, transition: "width 120ms ease-out" }} />
        </div>
        <span className="w-9 text-right text-[13px] font-semibold tabular-nums">{muted ? 0 : Math.round(volume * 100)}%</span>
      </div>

      {/* controls (tap the picture to show) */}
      <div
        className={`absolute inset-0 z-10 flex flex-col justify-between transition-opacity duration-200 ${controls || (vod && paused) ? "opacity-100" : "pointer-events-none opacity-0"}`}
        style={pad}
      >
        <div className="pointer-events-none absolute inset-x-0 top-0 h-24 bg-gradient-to-b from-black/70 to-transparent" />
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-28 bg-gradient-to-t from-black/75 to-transparent" />

        <div className="relative flex items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-2">
            {full && canExit && (
              <button aria-label="Exit full screen" onClick={onToggleFull} className={`${round} h-11 w-11 shrink-0`}>
                <Icon name="back" />
              </button>
            )}
            {full && current && (
              <div className="min-w-0 truncate text-[15px] font-semibold drop-shadow">
                {!vod && current.number ? `${current.number} · ` : ""}{current.name}
              </div>
            )}
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {full && !vod && (
              <button aria-label="Channels" onClick={onOpenChannels} className={`${round} h-11 w-11`}>
                <Icon name="list" />
              </button>
            )}
            {(!full || canExit) && (
              <button aria-label={full ? "Exit full screen" : "Full screen"} onClick={onToggleFull} className={`${round} h-11 w-11`}>
                <Icon name={full ? "exitfull" : "full"} />
              </button>
            )}
          </div>
        </div>

        <div className="pointer-events-none absolute inset-0 flex items-center justify-center gap-8">
          {vod ? (
            <>
              <button aria-label="Back 10 seconds" onClick={() => { seekBy(-10); show(); }} className={`${round} pointer-events-auto h-12 w-12 text-[13px] font-bold`}>−10</button>
              <button aria-label={paused ? "Play" : "Pause"} onClick={() => { togglePause(); show(); }} className={`${round} pointer-events-auto h-16 w-16`}>
                <Icon name={paused ? "play" : "pause"} className="h-8 w-8" />
              </button>
              <button aria-label="Forward 10 seconds" onClick={() => { seekBy(10); show(); }} className={`${round} pointer-events-auto h-12 w-12 text-[13px] font-bold`}>+10</button>
            </>
          ) : (
            <>
              <button aria-label="Previous channel" onClick={() => zap(-1)} className={`${round} pointer-events-auto h-14 w-14`}><Icon name="prev" className="h-7 w-7" /></button>
              <button aria-label="Next channel" onClick={() => zap(1)} className={`${round} pointer-events-auto h-14 w-14`}><Icon name="next" className="h-7 w-7" /></button>
            </>
          )}
        </div>

        {full ? (
          <div className="relative flex flex-col gap-1">
            {vod && <SeekBar />}
            <div className="flex items-center justify-between gap-2">
              <div className="flex min-w-0 items-center gap-1.5">
                {!vod && codecTags(tech).map((t) => (
                  <span key={t} className="rounded border border-[#8fd0ff]/70 bg-[#22566f]/80 px-1.5 text-[10px] font-bold italic leading-4 text-[#bfe6ff]">{t}</span>
                ))}
              </div>
              <div className="flex items-center gap-2">
                <button aria-label={muted ? "Unmute" : "Mute"} onClick={() => { toggleMute(); show(); }} className={`${round} h-11 w-11`}>
                  <SpeakerIcon muted={muted} className="h-5 w-5" />
                </button>
                {!vod && current && (
                  <button aria-label={mine ? "Stop recording" : "Record"} onClick={() => { void toggleRecord(current, rec); show(); }} className={`${round} h-11 w-11 ${mine ? "text-red-400" : ""}`}>
                    <Icon name={mine ? "stop" : "rec"} className="h-5 w-5" />
                  </button>
                )}
              </div>
            </div>
          </div>
        ) : <span />}
      </div>

      {mine && (
        <div className="pointer-events-none absolute right-2.5 top-2.5 z-10 flex items-center gap-1.5 rounded-full bg-black/65 px-2.5 py-1 text-[11px] font-bold text-white">
          <span className="h-2 w-2 animate-pulse rounded-full bg-[#ff3b3b]" /> REC
        </div>
      )}
    </div>
  );
}
