"use client";
import { useEffect, useMemo, useState } from "react";
import type { Channel } from "@/lib/m3u";
import {
  deleteRecording, fmtBytes, fmtDuration, Rec, recordingUrl, startRecording, stopRecording, useRecordings,
} from "@/lib/pvr-client";
import { useStore } from "@/lib/store";
import { Backdrop } from "./HomeMenu";
import { Clock, ColorKey, LabelKey, useNow } from "./ui";

const ROWS = 8;
const p2 = (n: number) => String(n).padStart(2, "0");
const fmtWhen = (t?: number) => {
  if (!t) return "—";
  const d = new Date(t);
  const today = new Date();
  const tomorrow = new Date(Date.now() + 86_400_000);
  const day = d.toDateString() === today.toDateString() ? "Today"
    : d.toDateString() === tomorrow.toDateString() ? "Tomorrow"
    : d.toLocaleDateString(undefined, { day: "2-digit", month: "short", year: "numeric" });
  return `${day} ${p2(d.getHours())}:${p2(d.getMinutes())}`;
};

const STATUS: Record<Rec["status"], { label: string; color: string; icon: string }> = {
  recording: { label: "Recording", color: "#ff5a5a", icon: "●" },
  finishing: { label: "Saving…", color: "#ffd166", icon: "◌" },
  scheduled: { label: "Timer", color: "#7cd3ff", icon: "⏰" },
  done: { label: "Recorded", color: "#7dff86", icon: "▶" },
  failed: { label: "Failed", color: "#ff9b9b", icon: "✕" },
  cancelled: { label: "Cancelled", color: "#aab4c3", icon: "✕" },
};

export default function PvrScreen() {
  const { recs, ffmpeg, refresh } = useRecordings();
  const channels = useStore((s) => s.channels);
  const now = useNow();
  const [cursor, setCursor] = useState(0);
  const [armed, setArmed] = useState<string | null>(null);
  const [toast, setToast] = useState("");
  const [timer, setTimer] = useState<TimerDraft | null>(null);

  const sel = recs[Math.min(cursor, Math.max(0, recs.length - 1))];
  const liveChannel = (): Channel | null => {
    const s = useStore.getState();
    return s.current && !s.current.vod ? s.current : s.lastLive ?? s.channels[0] ?? null;
  };

  const flash = (m: string) => { setToast(m); window.setTimeout(() => setToast(""), 2200); };
  const act = async (fn: () => Promise<unknown>, ok: string) => {
    try { await fn(); flash(ok); } catch (e) { flash((e as Error).message); }
    refresh();
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (useStore.getState().overlay || timer) return;
      const k = e.key;
      let handled = true;
      if (k === "ArrowUp") { setCursor((c) => Math.max(0, c - 1)); setArmed(null); }
      else if (k === "ArrowDown") { setCursor((c) => Math.min(recs.length - 1, c + 1)); setArmed(null); }
      else if (k === "PageUp") setCursor((c) => Math.max(0, c - ROWS));
      else if (k === "PageDown") setCursor((c) => Math.min(recs.length - 1, c + ROWS));
      else if (k === "Enter" && sel) {
        if (sel.status === "done") {
          useStore.getState().playVod(
            { id: `rec-${sel.id}`, number: sel.number ?? 0, name: sel.name, url: recordingUrl(sel.id), group: "Recordings", vod: "native" },
            "pvr",
          );
        } else if (sel.status === "recording") act(() => stopRecording(sel.id), `Stopping “${sel.name}”…`);
      } else if ((k === "d" || k === "D" || k === "Delete") && sel) {
        if (armed === sel.id) {
          setArmed(null);
          act(() => deleteRecording(sel.id), sel.status === "scheduled" ? "Timer removed" : "Recording deleted");
        } else setArmed(sel.id);
      } else if (k === "n" || k === "N") {
        const c = liveChannel();
        if (c) act(() => startRecording(c), `Recording “${c.name}”`);
      } else if (k === "t" || k === "T") {
        const c = liveChannel();
        setTimer(newDraft(c ? Math.max(0, channels.findIndex((x) => x.id === c.id)) : 0));
      } else if (k === "Escape" || k === "Backspace") {
        if (armed) setArmed(null);
        else useStore.getState().setView("home");
      } else handled = false;
      if (handled) e.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const start = Math.max(0, Math.min(cursor - 2, recs.length - ROWS));
  const visible = recs.slice(start, start + ROWS);
  const used = useMemo(() => recs.reduce((n, r) => n + (r.size || 0), 0), [recs]);

  const elapsed = (r: Rec) =>
    r.status === "recording" ? (now?.getTime() ?? Date.now()) - (r.start ?? Date.now())
    : r.start && r.end ? r.end - r.start : r.durationMin ? r.durationMin * 60_000 : undefined;

  return (
    <div className="mx-view-in absolute inset-0 overflow-hidden text-white">
      <Backdrop />
      <Clock className="absolute right-[4.6%] top-[7.2%]" />
      <div className="absolute left-[4.6%] top-[7.5%] text-[2.6cqw] font-semibold drop-shadow-[0_0.15cqw_0.3cqw_rgba(0,0,40,.4)]">PVR Manager</div>

      <Panel>
        {/* list */}
        <div className="absolute bottom-[4%] left-[2%] top-[4%] w-[60%]">
          <div className="flex px-[1.2cqw] pb-[0.6cqw] text-[1.05cqw] uppercase tracking-[0.08em] text-white/55">
            <span className="w-[6%]" />
            <span className="flex-1">Channel</span>
            <span className="w-[30%]">Time</span>
            <span className="w-[14%] text-right">Length</span>
          </div>
          {recs.length === 0 && (
            <div className="mt-[4cqw] text-center text-[1.4cqw] leading-[1.8] text-white/75">
              No recordings yet.<br />
              Press <b className="text-[#9fe4ff]">N</b> to record the current channel, or <b className="text-[#9fe4ff]">T</b> to set a timer.
            </div>
          )}
          {visible.map((r, i) => {
            const idx = start + i;
            const active = idx === cursor;
            const st = STATUS[r.status];
            return (
              <div
                key={r.id}
                onClick={() => setCursor(idx)}
                className="relative flex h-[10.5%] cursor-pointer items-center rounded-[0.6cqw] px-[1.2cqw] text-[1.35cqw]"
                style={{
                  background: active ? "linear-gradient(90deg,#11b5ec 0%,#16c6f2 75%,rgba(22,198,242,.6) 100%)" : "transparent",
                  boxShadow: active ? "0 0 1cqw rgba(30,200,255,.45)" : "none",
                }}
              >
                <span className={`w-[6%] text-[1.3cqw] ${r.status === "recording" ? "animate-pulse" : ""}`} style={{ color: active ? "#fff" : st.color }}>{st.icon}</span>
                <span className="flex-1 truncate">{r.number ? `${r.number}  ` : ""}{r.name}</span>
                <span className="w-[30%] truncate text-[1.2cqw] text-white/85">{fmtWhen(r.start ?? r.scheduledStart)}</span>
                <span className="w-[14%] text-right text-[1.2cqw] tabular-nums">{fmtDuration(elapsed(r))}</span>
              </div>
            );
          })}
        </div>

        {/* details */}
        <div className="absolute bottom-[4%] right-[2%] top-[4%] w-[34%] rounded-[0.8cqw] bg-white/8 p-[1.6cqw]">
          {sel ? (
            <>
              <div className="truncate text-[1.7cqw] font-semibold">{sel.name}</div>
              <div className="mt-[0.4cqw] text-[1.3cqw] font-semibold" style={{ color: STATUS[sel.status].color }}>
                {STATUS[sel.status].label}
              </div>
              <div className="mt-[1cqw] text-[1.15cqw] leading-[1.9] text-white/85">
                {sel.status === "scheduled" ? (
                  <>
                    <Row k="Starts" v={fmtWhen(sel.scheduledStart)} />
                    <Row k="Length" v={sel.durationMin ? `${sel.durationMin} min` : "—"} />
                  </>
                ) : (
                  <>
                    <Row k="Started" v={fmtWhen(sel.start)} />
                    <Row k={sel.status === "recording" ? "Elapsed" : "Length"} v={fmtDuration(elapsed(sel))} />
                    {sel.status === "recording" && sel.plannedEnd && <Row k="Ends" v={fmtWhen(sel.plannedEnd)} />}
                    <Row k="Size" v={fmtBytes(sel.size)} />
                  </>
                )}
                <Row k="Quality" v={sel.mode === "video" ? "Converted 720p" : "Original video"} />
              </div>
              {sel.error && <div className="mt-[0.8cqw] text-[1.05cqw] leading-[1.5] text-[#ffb3a8]">{sel.error}</div>}
              <div className="mt-[1.2cqw] text-[1.1cqw] text-[#bfe6ff]">
                {armed === sel.id ? "Press D again to confirm delete"
                  : sel.status === "done" ? "OK to play"
                  : sel.status === "recording" ? "OK to stop recording" : ""}
              </div>
            </>
          ) : (
            <div className="text-[1.25cqw] leading-[1.7] text-white/75">Recordings are saved as MP4 files in the <b>recordings</b> folder of the player.</div>
          )}
          <div className="absolute bottom-[1.6cqw] left-[1.6cqw] right-[1.6cqw] border-t border-white/15 pt-[0.8cqw] text-[1.05cqw] text-white/65">
            {recs.filter((r) => r.status === "done").length} recordings · {fmtBytes(used)}
            {!ffmpeg && <div className="text-[#ffb3a8]">ffmpeg not found: recording is unavailable</div>}
          </div>
        </div>
      </Panel>

      {toast && <Toast>{toast}</Toast>}
      {timer && (
        <TimerDialog
          draft={timer}
          channels={channels}
          onChange={setTimer}
          onCancel={() => setTimer(null)}
          onSave={(d) => {
            const c = channels[d.channel];
            setTimer(null);
            if (c) act(() => startRecording(c, { startAt: d.startAt, durationMin: d.duration }), `Timer set: ${c.name} · ${fmtWhen(d.startAt)}`);
          }}
        />
      )}

      <div className="absolute bottom-[4.5%] left-[4.6%] right-[4.6%] flex items-center justify-center gap-[2.6cqw] text-[1.2cqw] text-white/90">
        <span className="flex items-center gap-[0.6cqw]"><LabelKey>OK</LabelKey> Play / Stop</span>
        <span className="flex items-center gap-[0.6cqw]"><ColorKey color="red" /> Delete (D)</span>
        <span className="flex items-center gap-[0.6cqw]"><ColorKey color="green" /> Record now (N)</span>
        <span className="flex items-center gap-[0.6cqw]"><ColorKey color="yellow" /> New timer (T)</span>
        <span className="flex items-center gap-[0.6cqw]"><LabelKey>Esc</LabelKey> Back</span>
      </div>
    </div>
  );
}

// ---------- timer dialog ----------

interface TimerDraft { channel: number; startAt: number; duration: number; field: number }

function newDraft(channel: number): TimerDraft {
  const step = 5 * 60_000;
  const startAt = Math.ceil((Date.now() + step) / step) * step; // next 5-minute mark, at least 5 min ahead
  return { channel, startAt, duration: 60, field: 0 };
}

function TimerDialog({ draft, channels, onChange, onCancel, onSave }: {
  draft: TimerDraft; channels: Channel[];
  onChange: (d: TimerDraft) => void; onCancel: () => void; onSave: (d: TimerDraft) => void;
}) {
  const fields = ["Channel", "Day", "Start time", "Length", "Save"];

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const k = e.key;
      const d = { ...draft };
      const adj = (dir: number, big = false) => {
        if (d.field === 0) d.channel = (d.channel + dir * (big ? 10 : 1) + channels.length) % channels.length;
        else if (d.field === 1) d.startAt += dir * 86_400_000;
        else if (d.field === 2) d.startAt += dir * (big ? 60 : 5) * 60_000;
        else if (d.field === 3) d.duration = Math.max(5, Math.min(480, d.duration + dir * (big ? 60 : 15)));
        // never in the past
        const min = Date.now() - (d.duration - 1) * 60_000;
        if (d.startAt < min) d.startAt = Math.ceil(Date.now() / 60_000) * 60_000;
      };
      let handled = true;
      if (k === "ArrowUp") d.field = (d.field + fields.length - 1) % fields.length;
      else if (k === "ArrowDown") d.field = (d.field + 1) % fields.length;
      else if (k === "ArrowLeft") adj(-1);
      else if (k === "ArrowRight") adj(1);
      else if (k === "PageUp") adj(1, true);
      else if (k === "PageDown") adj(-1, true);
      else if (k === "Enter") { if (d.field === fields.length - 1) { onSave(d); return e.preventDefault(); } d.field = fields.length - 1; }
      else if (k === "Escape" || k === "Backspace") { onCancel(); return e.preventDefault(); }
      else handled = false;
      if (handled) { e.preventDefault(); onChange(d); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const d = new Date(draft.startAt);
  const end = new Date(draft.startAt + draft.duration * 60_000);
  const c = channels[draft.channel];
  const values = [
    c ? `${c.number}  ${c.name}` : "—",
    fmtWhen(draft.startAt).split(" ").slice(0, -1).join(" ") || "Today",
    `${p2(d.getHours())}:${p2(d.getMinutes())}  →  ${p2(end.getHours())}:${p2(end.getMinutes())}`,
    `${draft.duration} min`,
  ];

  return (
    <div className="mx-fade-in absolute inset-0 z-40 flex items-center justify-center bg-black/55">
      <div className="w-[52%] rounded-[1cqw] border border-[#5d7fd6] p-[2cqw] shadow-2xl" style={{ background: "linear-gradient(180deg,#2a50e8 0%,#1d38b8 100%)" }}>
        <div className="mb-[1.2cqw] text-[2cqw] font-semibold">New timer recording</div>
        {fields.map((f, i) => {
          const active = draft.field === i;
          const isSave = i === fields.length - 1;
          return (
            <div
              key={f}
              onClick={() => (isSave ? onSave(draft) : onChange({ ...draft, field: i }))}
              className={`flex h-[4.2cqw] cursor-pointer items-center rounded-[0.6cqw] px-[1.2cqw] text-[1.4cqw] ${isSave ? "mt-[1cqw] justify-center font-semibold" : ""}`}
              style={{ background: active ? "linear-gradient(90deg,#11b5ec,#16c6f2)" : isSave ? "rgba(255,255,255,.12)" : "transparent" }}
            >
              {isSave ? "Save timer" : (
                <>
                  <span className="w-[30%] text-white/80">{f}</span>
                  <span className="flex flex-1 items-center justify-between font-semibold">
                    <span className={active ? "" : "opacity-0"}>◀</span>
                    <span className="truncate px-[1cqw]">{values[i]}</span>
                    <span className={active ? "" : "opacity-0"}>▶</span>
                  </span>
                </>
              )}
            </div>
          );
        })}
        <div className="mt-[1.2cqw] text-center text-[1.05cqw] text-white/70">
          ▲▼ field · ◀▶ change · PgUp/PgDn bigger steps · OK save · Esc cancel
        </div>
      </div>
    </div>
  );
}

// ---------- bits ----------

function Panel({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="absolute left-[4.6%] right-[4.6%] top-[20%] bottom-[13%] overflow-hidden rounded-[1cqw]"
      style={{ background: "linear-gradient(180deg, rgba(14,28,110,.55), rgba(10,20,90,.65))", boxShadow: "inset 0 0 0 0.12cqw rgba(160,200,255,.25), 0 1cqw 3cqw rgba(0,0,50,.35)" }}
    >
      {children}
    </div>
  );
}

function Row({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div className="flex">
      <span className="w-[38%] text-white/60">{k}</span>
      <span className="flex-1 truncate">{v}</span>
    </div>
  );
}

function Toast({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-fade-in absolute bottom-[15%] left-1/2 z-30 max-w-[70%] -translate-x-1/2 truncate rounded-[0.5cqw] bg-[#0f1a2e]/95 px-[1.6cqw] py-[0.6cqw] text-[1.25cqw] shadow-lg">
      {children}
    </div>
  );
}

export { Panel, Toast };
