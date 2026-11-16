"use client";
import { useEffect, useRef, useState } from "react";
import { fmtDuration, startRecording, stopRecording, useRecordings } from "@/lib/pvr-client";
import { useStore } from "@/lib/store";
import { LabelKey, useNow } from "./ui";
import { playerRef } from "./VideoPlayer";

/** Seek / pause controls for recordings and files. Called from the Receiver's key handler. */
export function vodKey(key: string): boolean {
  const v = playerRef.video;
  if (!v) return false;
  const seek = (d: number) => {
    if (!Number.isFinite(v.duration)) return; // live-converted file: not seekable
    v.currentTime = Math.max(0, Math.min(v.duration - 0.5, v.currentTime + d));
  };
  switch (key) {
    case "ArrowLeft": seek(-10); break;
    case "ArrowRight": seek(10); break;
    case "ArrowDown": seek(-60); break;
    case "ArrowUp": seek(60); break;
    case "PageDown": seek(-600); break;
    case "PageUp": seek(600); break;
    case "Enter":
    case " ":
      if (v.paused) v.play().catch(() => {}); else v.pause();
      break;
    default:
      return false;
  }
  window.dispatchEvent(new Event("mx-vod-ui"));
  return true;
}

export function VodBar() {
  const current = useStore((s) => s.current);
  const [t, setT] = useState({ pos: 0, dur: 0, paused: false });
  const [visible, setVisible] = useState(true);
  const hideTimer = useRef<number | undefined>(undefined);

  useEffect(() => {
    const v = playerRef.video;
    if (!v) return;
    const upd = () => setT({ pos: v.currentTime, dur: Number.isFinite(v.duration) ? v.duration : 0, paused: v.paused });
    const show = () => {
      setVisible(true);
      window.clearTimeout(hideTimer.current);
      hideTimer.current = window.setTimeout(() => setVisible(false), 4000);
    };
    upd(); show();
    const evs = ["timeupdate", "durationchange", "play", "pause", "seeked"];
    evs.forEach((e) => v.addEventListener(e, upd));
    window.addEventListener("mx-vod-ui", show);
    return () => {
      evs.forEach((e) => v.removeEventListener(e, upd));
      window.removeEventListener("mx-vod-ui", show);
      window.clearTimeout(hideTimer.current);
    };
  }, [current?.id]);

  if (!current?.vod) return null;
  const pct = t.dur ? (t.pos / t.dur) * 100 : 0;
  const shown = visible || t.paused;
  return (
    <div
      className={`absolute inset-x-0 bottom-0 z-30 px-[3%] pb-[2.6%] pt-[3%] text-white transition-[opacity,translate] duration-300 ${shown ? "opacity-100" : "pointer-events-none translate-y-[15%] opacity-0"}`}
      style={{ background: "linear-gradient(180deg, rgba(10,16,28,0) 0%, rgba(10,16,28,.85) 45%, rgba(10,16,28,.95) 100%)" }}
    >
      <div className="flex items-end justify-between">
        <div className="flex items-center gap-[1.2cqw]">
          <span className="flex h-[3.4cqw] w-[3.4cqw] items-center justify-center rounded-full bg-[#16c6f2] text-[1.6cqw] text-[#062033]">
            {t.paused ? "▶" : "❚❚"}
          </span>
          <div>
            <div className="text-[1.1cqw] uppercase tracking-[0.12em] text-[#9fe4ff]">{current.group === "Recordings" ? "Recording" : "File"}</div>
            <div className="max-w-[60cqw] truncate text-[2cqw] font-semibold">{current.name}</div>
          </div>
        </div>
        <div className="text-[1.5cqw] tabular-nums text-white/90">
          {fmtDuration(t.pos * 1000 || 1)} <span className="text-white/50">/ {t.dur ? fmtDuration(t.dur * 1000) : "live"}</span>
        </div>
      </div>
      <div className="mt-[1cqw] h-[0.55cqw] overflow-hidden rounded-full bg-white/20">
        <div className="h-full rounded-full bg-[#16c6f2]" style={{ width: `${pct}%`, transition: "width 250ms linear" }} />
      </div>
      <div className="mt-[1cqw] flex justify-center gap-[2.4cqw] text-[1.1cqw] text-white/80">
        <span className="flex items-center gap-[0.5cqw]"><LabelKey>OK</LabelKey> Pause</span>
        <span className="flex items-center gap-[0.5cqw]"><LabelKey>◀▶</LabelKey> 10 s</span>
        <span className="flex items-center gap-[0.5cqw]"><LabelKey>▲▼</LabelKey> 1 min</span>
        <span className="flex items-center gap-[0.5cqw]"><LabelKey>PgUp/Dn</LabelKey> 10 min</span>
        <span className="flex items-center gap-[0.5cqw]"><LabelKey>Esc</LabelKey> Back</span>
      </div>
    </div>
  );
}

/** "● REC" badge on live TV, plus the R key to start/stop recording the current channel. */
export function RecBadge() {
  const view = useStore((s) => s.view);
  const current = useStore((s) => s.current);
  const { recs, refresh } = useRecordings(view === "tv");
  const now = useNow();
  const [msg, setMsg] = useState("");

  const active = recs.filter((r) => r.status === "recording");
  const mine = current && !current.vod ? active.find((r) => r.name === current.name && r.number === current.number) : undefined;

  useEffect(() => {
    const onKey = async (e: KeyboardEvent) => {
      const s = useStore.getState();
      if (s.view !== "tv" || s.overlay || !s.current || s.current.vod) return;
      if (e.key !== "r" && e.key !== "R") return;
      if ((e.target as HTMLElement)?.closest?.("input,textarea")) return;
      e.preventDefault();
      try {
        if (mine) { await stopRecording(mine.id); setMsg("Recording stopped — saved to PVR Manager"); }
        else { await startRecording(s.current); setMsg(`Recording ${s.current.name}`); }
      } catch (err) { setMsg((err as Error).message); }
      refresh();
      window.setTimeout(() => setMsg(""), 2500);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [mine, refresh]);

  if (view !== "tv") return null;
  return (
    <div className="pointer-events-none absolute right-[2.4%] top-[3.5%] z-30 flex flex-col items-end gap-[0.6cqw]">
      {active.length > 0 && (
        <div className="flex items-center gap-[0.8cqw] rounded-[0.5cqw] bg-black/60 px-[1cqw] py-[0.45cqw] text-[1.15cqw] font-semibold">
          <span className="h-[1cqw] w-[1cqw] animate-pulse rounded-full bg-[#ff3b3b] shadow-[0_0_0.8cqw_#ff3b3b]" />
          REC
          <span className="font-normal text-white/85">
            {active.length > 1 ? `${active.length} channels` : `${active[0].name} · ${fmtDuration((now?.getTime() ?? Date.now()) - (active[0].start ?? Date.now()))}`}
          </span>
        </div>
      )}
      {msg && <div className="mx-fade-in rounded-[0.5cqw] bg-[#0f1a2e]/90 px-[1.2cqw] py-[0.5cqw] text-[1.15cqw]">{msg}</div>}
    </div>
  );
}

/** Press S on live TV: technical overlay (method, codecs, buffer, audio decoding) for diagnosing problems. */
export function StatsPanel() {
  const view = useStore((s) => s.view);
  const method = useStore((s) => s.method);
  const tech = useStore((s) => s.tech);
  const audioOk = useStore((s) => s.audioOk);
  const playState = useStore((s) => s.playState);
  const [open, setOpen] = useState(false);
  const [m, setM] = useState({ buffer: 0, dropped: 0, frames: 0, audioKB: -1, muted: false, volume: 1 });

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const s = useStore.getState();
      if (s.view !== "tv" || s.overlay || (e.key !== "s" && e.key !== "S")) return;
      if ((e.target as HTMLElement)?.closest?.("input,textarea")) return;
      e.preventDefault();
      setOpen((o) => !o);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (!open) return;
    const tick = () => {
      const v = playerRef.video as (HTMLVideoElement & { webkitAudioDecodedByteCount?: number }) | null;
      if (!v) return;
      let buffer = 0;
      for (let i = 0; i < v.buffered.length; i++) {
        if (v.buffered.start(i) <= v.currentTime && v.currentTime <= v.buffered.end(i)) buffer = v.buffered.end(i) - v.currentTime;
      }
      const q = v.getVideoPlaybackQuality?.();
      setM({
        buffer,
        dropped: q?.droppedVideoFrames ?? 0,
        frames: q?.totalVideoFrames ?? 0,
        audioKB: typeof v.webkitAudioDecodedByteCount === "number" ? Math.round(v.webkitAudioDecodedByteCount / 1024) : -1,
        muted: v.muted,
        volume: v.volume,
      });
    };
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, [open]);

  if (!open || view !== "tv") return null;
  const audio =
    m.muted ? <span className="text-[#ffe27a]">muted (press any key)</span>
    : audioOk === false ? <span className="text-[#ff9b9b]">not decoding ✗</span>
    : audioOk === true ? <span className="text-[#7dff86]">decoding ✓</span>
    : <span className="text-white/60">unknown</span>;
  const rows: [string, React.ReactNode][] = [
    ["State", playState],
    ["Method", method || "—"],
    ["Video", `${tech.videoCodec ?? "—"} ${tech.width && tech.height ? `· ${tech.width}x${tech.height}` : ""}`],
    ["Audio codec", tech.audioCodec ?? "—"],
    ["Audio", audio],
    ["Audio decoded", m.audioKB >= 0 ? `${m.audioKB.toLocaleString()} KB` : "n/a in this browser"],
    ["Buffer", `${m.buffer.toFixed(1)} s`],
    ["Dropped frames", `${m.dropped} / ${m.frames}`],
    ["Volume", `${Math.round(m.volume * 100)}%`],
  ];
  return (
    <div className="pointer-events-none absolute left-[2%] top-[12%] z-30 w-[30%] rounded-[0.6cqw] bg-black/75 p-[1.2cqw] text-[1.1cqw] leading-[1.7] text-white shadow-lg">
      <div className="mb-[0.4cqw] font-semibold text-[#5fdcff]">Stream stats <span className="font-normal text-white/50">(S to close)</span></div>
      {rows.map(([k, v]) => (
        <div key={k} className="flex gap-[1cqw]">
          <span className="w-[42%] shrink-0 text-white/60">{k}</span>
          <span className="truncate">{v}</span>
        </div>
      ))}
    </div>
  );
}
