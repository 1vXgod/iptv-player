"use client";
import { useState } from "react";
import { codecTags, useStore } from "@/lib/store";
import { SpeakerIcon } from "../ui";
import { toggleMute } from "../VideoPlayer";
import { Icon, type IconName } from "./icons";
import { ChannelBadge, RecCtx, recordingOf, SeekBar, toggleRecord, useVideoTime } from "./MobilePlayer";
import { buzz, seekBy, togglePause } from "./utils";

function Action({ label, onClick, children, active = false }: { label: string; onClick: () => void; children: React.ReactNode; active?: boolean }) {
  return (
    <button
      onClick={onClick}
      aria-label={label}
      className={`flex h-14 min-w-0 flex-1 flex-col items-center justify-center gap-0.5 rounded-xl text-[11px] font-medium transition-colors active:bg-white/10 ${active ? "text-red-400" : "text-white/80"}`}
    >
      {children}
      <span className="truncate">{label}</span>
    </button>
  );
}
const I = ({ name }: { name: IconName }) => <Icon name={name} className="h-6 w-6" />;

/** Under the picture in portrait: what's playing, plus the main controls as big touch targets. */
export default function NowPlaying({ rec, onToggleFull, onRotate, ffmpeg = true }: { rec: RecCtx; onToggleFull: () => void; onRotate: () => void; ffmpeg?: boolean }) {
  const [hideWarn, setHideWarn] = useState(false);
  const current = useStore((s) => s.current);
  const tech = useStore((s) => s.tech);
  const muted = useStore((s) => s.muted);
  const playState = useStore((s) => s.playState);
  const { paused } = useVideoTime();
  const vod = !!current?.vod;
  const mine = recordingOf(rec.recs, current);

  const status = playState === "playing" ? "Live" : playState === "loading" ? "Tuning…" : playState === "error" ? "No signal" : "";
  const statusColor = playState === "playing" ? "text-[#7dff86]" : playState === "error" ? "text-[#ff9b9b]" : "text-[#ffe27a]";

  return (
    <div className="shrink-0 border-b border-white/8 bg-[#0a1020] px-3 pb-1.5 pt-3">
      {!ffmpeg && !hideWarn && (
        <div className="mb-3 flex items-start gap-2 rounded-xl bg-amber-400/15 px-3 py-2 text-[12px] leading-snug text-amber-200">
          <span className="flex-1">
            This server has no ffmpeg, so it can&apos;t convert streams. Some channels may have no sound or show green lines.
            Run the app on your PC or a server with ffmpeg for clean playback.
          </span>
          <button aria-label="Dismiss" onClick={() => setHideWarn(true)} className="-mr-1 -mt-1 flex h-8 w-8 shrink-0 items-center justify-center text-amber-200/80">✕</button>
        </div>
      )}
      <div className="flex items-center gap-3">
        <ChannelBadge c={current} />
        <div className="min-w-0 flex-1">
          <div className="truncate text-[16px] font-semibold leading-tight">
            {current ? `${!vod && current.number ? `${current.number} · ` : ""}${current.name}` : "No channel selected"}
          </div>
          <div className="mt-0.5 flex items-center gap-2 text-xs text-white/55">
            {vod ? <span>{current?.group === "Recordings" ? "Recording" : "File"}</span> : <span className="truncate">{current?.group}</span>}
            {!vod && status && <span className={`font-semibold ${statusColor}`}>{status}</span>}
            {!vod && playState === "playing" && codecTags(tech).slice(0, 3).map((t) => (
              <span key={t} className="rounded border border-white/25 px-1 text-[9px] font-bold italic leading-[14px] text-white/70">{t}</span>
            ))}
          </div>
        </div>
      </div>

      {vod && <div className="mt-2"><SeekBar /></div>}

      <div className="mt-1.5 flex items-stretch">
        {vod ? (
          <>
            <Action label="−10 s" onClick={() => { buzz(8); seekBy(-10); }}><span className="text-[15px] font-bold leading-6">−10</span></Action>
            <Action label={paused ? "Play" : "Pause"} onClick={() => { buzz(8); togglePause(); }}><I name={paused ? "play" : "pause"} /></Action>
            <Action label="+10 s" onClick={() => { buzz(8); seekBy(10); }}><span className="text-[15px] font-bold leading-6">+10</span></Action>
            <Action label="Back to live" onClick={() => useStore.getState().exitVod()}><I name="tv" /></Action>
          </>
        ) : (
          <>
            <Action label="Previous" onClick={() => { buzz(8); useStore.getState().zap(-1); }}><I name="prev" /></Action>
            <Action label="Next" onClick={() => { buzz(8); useStore.getState().zap(1); }}><I name="next" /></Action>
            <Action label={muted ? "Unmute" : "Mute"} onClick={toggleMute}><SpeakerIcon muted={muted} className="h-6 w-6" /></Action>
            <Action label={mine ? "Stop rec" : "Record"} active={!!mine} onClick={() => current && void toggleRecord(current, rec)}>
              <Icon name={mine ? "stop" : "rec"} className="h-6 w-6" />
            </Action>
            <Action label="Rotate" onClick={onRotate}><I name="rotate" /></Action>
            <Action label="Full screen" onClick={onToggleFull}><I name="full" /></Action>
          </>
        )}
      </div>
    </div>
  );
}
