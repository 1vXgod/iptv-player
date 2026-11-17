"use client";
import { useEffect, useRef, useState } from "react";
import { deleteRecording, fmtBytes, fmtDuration, type Rec, recordingUrl, startRecording, stopRecording } from "@/lib/pvr-client";
import { useStore } from "@/lib/store";
import { Icon } from "./icons";
import { type RecCtx, recordingOf, toggleRecord } from "./MobilePlayer";
import { field, GhostButton, PrimaryButton, Sheet } from "./ui";

const p2 = (n: number) => String(n).padStart(2, "0");
const toLocalInput = (t: number) => {
  const d = new Date(t);
  return `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}T${p2(d.getHours())}:${p2(d.getMinutes())}`;
};
const fmtWhen = (t?: number) => {
  if (!t) return "—";
  const d = new Date(t);
  const day = d.toDateString() === new Date().toDateString() ? "Today" : d.toLocaleDateString(undefined, { day: "numeric", month: "short" });
  return `${day} ${p2(d.getHours())}:${p2(d.getMinutes())}`;
};

const STATUS: Record<Rec["status"], { label: string; cls: string }> = {
  recording: { label: "Recording", cls: "bg-red-500/20 text-red-300" },
  finishing: { label: "Saving…", cls: "bg-yellow-400/20 text-yellow-200" },
  scheduled: { label: "Timer", cls: "bg-sky-400/20 text-sky-200" },
  done: { label: "Recorded", cls: "bg-emerald-400/20 text-emerald-200" },
  failed: { label: "Failed", cls: "bg-red-500/20 text-red-300" },
  cancelled: { label: "Cancelled", cls: "bg-white/10 text-white/60" },
};

export default function RecordingsTab({ rec, ffmpeg }: { rec: RecCtx; ffmpeg: boolean }) {
  const current = useStore((s) => s.current);
  const channels = useStore((s) => s.channels);
  const [armed, setArmed] = useState<string | null>(null);
  const [timerOpen, setTimerOpen] = useState(false);
  const now = Date.now();
  const live = current && !current.vod ? current : null;
  const mine = recordingOf(rec.recs, live);

  useEffect(() => {
    if (!armed) return;
    const id = window.setTimeout(() => setArmed(null), 3000);
    return () => window.clearTimeout(id);
  }, [armed]);

  const act = async (fn: () => Promise<unknown>, ok: string) => {
    try { await fn(); rec.say(ok); } catch (e) { rec.say((e as Error).message); }
    rec.refresh();
  };

  const play = (r: Rec) =>
    useStore.getState().playVod({ id: `rec-${r.id}`, number: r.number ?? 0, name: r.name, url: recordingUrl(r.id), group: "Recordings", vod: "native" }, "tv");

  const openFile = (f: File | undefined) => {
    if (!f) return;
    useStore.getState().playVod({ id: `local-${f.name}-${f.size}`, number: 0, name: f.name.replace(/\.[^.]+$/, ""), url: URL.createObjectURL(f), group: "Files", vod: "native" }, "tv");
  };

  const elapsed = (r: Rec) =>
    r.status === "recording" ? now - (r.start ?? now) : r.start && r.end ? r.end - r.start : r.durationMin ? r.durationMin * 60_000 : undefined;

  return (
    <div className="m-scroll h-full overflow-y-auto px-3 pb-6 pt-3">
      <div className="grid grid-cols-2 gap-2">
        <PrimaryButton disabled={!live} onClick={() => live && void toggleRecord(live, rec)} className={mine ? "!bg-red-500 !text-white" : ""}>
          <Icon name={mine ? "stop" : "rec"} className="h-5 w-5" /> {mine ? "Stop recording" : "Record now"}
        </PrimaryButton>
        <GhostButton onClick={() => setTimerOpen(true)}><Icon name="clock" className="h-5 w-5" /> Set a timer</GhostButton>
      </div>
      <label className="mt-2 flex h-12 cursor-pointer items-center justify-center gap-2 rounded-xl border border-white/15 text-[15px] font-semibold text-white active:bg-white/10">
        <Icon name="film" className="h-5 w-5" /> Play a video from this phone
        <input type="file" accept="video/*,audio/*" hidden onChange={(e) => { openFile(e.target.files?.[0]); e.target.value = ""; }} />
      </label>
      {!ffmpeg && <div className="mt-3 rounded-xl bg-red-500/15 px-3 py-2.5 text-[13px] text-red-200">Recording needs ffmpeg on the server, and it wasn&apos;t found.</div>}

      <h3 className="mb-2 mt-5 px-1 text-xs font-semibold uppercase tracking-wider text-white/45">Recordings</h3>
      {rec.recs.length === 0 && (
        <div className="rounded-2xl border border-dashed border-white/12 px-5 py-10 text-center text-sm text-white/45">
          Nothing recorded yet. Record the channel you&apos;re watching, or set a timer.
        </div>
      )}
      <div className="flex flex-col gap-2">
        {rec.recs.map((r) => {
          const st = STATUS[r.status];
          const confirm = armed === r.id;
          return (
            <div key={r.id} className="rounded-2xl bg-white/6 p-3">
              <div className="flex items-start gap-3">
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[15px] font-semibold">{r.number ? `${r.number} · ` : ""}{r.name}</div>
                  <div className="mt-0.5 text-xs text-white/50">
                    {fmtWhen(r.start ?? r.scheduledStart)}
                    {r.status === "scheduled" ? (r.durationMin ? ` · ${r.durationMin} min` : "") : ` · ${fmtDuration(elapsed(r))}`}
                    {r.size ? ` · ${fmtBytes(r.size)}` : ""}
                  </div>
                </div>
                <span className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-bold ${st.cls}`}>{st.label}</span>
              </div>
              {r.error && <div className="mt-2 text-xs leading-snug text-red-300/90">{r.error}</div>}
              <div className="mt-2.5 flex gap-2">
                {r.status === "done" && (
                  <button onClick={() => play(r)} className="flex h-11 flex-1 items-center justify-center gap-2 rounded-xl bg-[#16c6f2] text-sm font-semibold text-[#062033] active:opacity-80">
                    <Icon name="play" className="h-4 w-4" /> Play
                  </button>
                )}
                {r.status === "recording" && (
                  <button onClick={() => void act(() => stopRecording(r.id), "Recording stopped")} className="flex h-11 flex-1 items-center justify-center gap-2 rounded-xl bg-red-500 text-sm font-semibold text-white active:opacity-80">
                    <Icon name="stop" className="h-4 w-4" /> Stop
                  </button>
                )}
                {r.status !== "recording" && r.status !== "finishing" && (
                  <button
                    onClick={() => (confirm ? (setArmed(null), void act(() => deleteRecording(r.id), r.status === "scheduled" ? "Timer removed" : "Recording deleted")) : setArmed(r.id))}
                    className={`flex h-11 items-center justify-center gap-2 rounded-xl border px-4 text-sm font-semibold active:bg-white/10 ${confirm ? "border-red-400 bg-red-500/20 text-red-200" : "border-white/15 text-white/80"} ${r.status === "done" ? "" : "flex-1"}`}
                  >
                    <Icon name="trash" className="h-4 w-4" /> {confirm ? "Tap again" : r.status === "scheduled" ? "Cancel timer" : "Delete"}
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <TimerSheet open={timerOpen} onClose={() => setTimerOpen(false)} rec={rec} channelsCount={channels.length} />
    </div>
  );
}

function TimerSheet({ open, onClose, rec, channelsCount }: { open: boolean; onClose: () => void; rec: RecCtx; channelsCount: number }) {
  const channels = useStore((s) => s.channels);
  const current = useStore((s) => s.current);
  const [idx, setIdx] = useState(0);
  const [when, setWhen] = useState("");
  const [mins, setMins] = useState(60);
  const wasOpen = useRef(false);

  // fresh defaults every time the sheet opens
  useEffect(() => {
    if (open && !wasOpen.current) {
      const step = 5 * 60_000;
      setWhen(toLocalInput(Math.ceil((Date.now() + step) / step) * step));
      setIdx(current && !current.vod ? Math.max(0, channels.findIndex((c) => c.id === current.id)) : 0);
      setMins(60);
    }
    wasOpen.current = open;
  }, [open, current, channels]);

  const save = async () => {
    const c = channels[idx];
    const t = new Date(when).getTime();
    if (!c || !Number.isFinite(t)) { rec.say("Pick a channel and a start time"); return; }
    if (t + mins * 60_000 < Date.now()) { rec.say("That time has already passed"); return; }
    try { await startRecording(c, { startAt: t, durationMin: mins }); rec.say(`Timer set: ${c.name} · ${fmtWhen(t)}`); onClose(); }
    catch (e) { rec.say((e as Error).message); }
    rec.refresh();
  };

  return (
    <Sheet open={open} onClose={onClose} title="New timer recording">
      <div className="flex flex-col gap-3 px-4 pb-5 pt-1">
        <label className="text-xs font-semibold uppercase tracking-wider text-white/45">Channel</label>
        <select value={idx} onChange={(e) => setIdx(Number(e.target.value))} className={field}>
          {channels.slice(0, Math.max(channelsCount, 0)).map((c, i) => <option key={c.id} value={i}>{c.number} · {c.name}</option>)}
        </select>
        <label className="mt-1 text-xs font-semibold uppercase tracking-wider text-white/45">Starts</label>
        <input type="datetime-local" value={when} min={toLocalInput(Date.now())} onChange={(e) => setWhen(e.target.value)} className={field} />
        <label className="mt-1 text-xs font-semibold uppercase tracking-wider text-white/45">Length</label>
        <select value={mins} onChange={(e) => setMins(Number(e.target.value))} className={field}>
          {[15, 30, 45, 60, 90, 120, 180, 240].map((m) => <option key={m} value={m}>{m >= 60 ? `${m / 60 === Math.floor(m / 60) ? m / 60 : (m / 60).toFixed(1)} h` : `${m} min`}</option>)}
        </select>
        <PrimaryButton onClick={() => void save()} className="mt-3">Save timer</PrimaryButton>
        <p className="text-center text-xs text-white/40">Timers run on the server, so it has to stay running at that time.</p>
      </div>
    </Sheet>
  );
}
