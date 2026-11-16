/**
 * PVR recorder (server side). Records live channels with ffmpeg into the
 * recordings folder as MP4, and runs scheduled (timer) recordings.
 *
 * Recording is written as fragmented MP4 (survives crashes / power loss), then
 * remuxed to a normal fast-start MP4 when it finishes so it's seekable in the browser.
 * State lives on globalThis so dev hot-reloads don't duplicate timers or lose processes.
 */
import { spawn, type ChildProcess } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { findFfmpeg } from "./ffmpeg";
import { mediaRoots } from "./media";

const UPSTREAM_UA = process.env.IPTV_USER_AGENT || "VLC/3.0.20 LibVLC/3.0.20";
const MAX_TIMER_MS = 2_000_000_000; // setTimeout limit (~23 days); re-armed in steps

export type RecStatus = "scheduled" | "recording" | "finishing" | "done" | "failed" | "cancelled";
export type RecMode = "audio" | "video"; // audio: copy video + AAC audio; video: deinterlace + re-encode 720p

export interface Recording {
  id: string;
  name: string; // channel name
  number?: number;
  streamUrl: string;
  mode: RecMode;
  status: RecStatus;
  scheduledStart?: number; // ms epoch
  durationMin?: number; // planned length (undefined = until stopped)
  start?: number;
  end?: number;
  file?: string; // basename inside recordings dir
  size?: number;
  error?: string;
}

/** What the browser gets: never includes the stream URL (it can contain credentials). */
export type PublicRecording = Omit<Recording, "streamUrl"> & { plannedEnd?: number };

interface Store {
  recs: Map<string, Recording>;
  procs: Map<string, ChildProcess>;
  timers: Map<string, NodeJS.Timeout>;
  loaded: boolean;
}
const G = globalThis as unknown as { __mxRecorder?: Store };
const S: Store = (G.__mxRecorder ??= { recs: new Map(), procs: new Map(), timers: new Map(), loaded: false });

const dir = () => mediaRoots().recordings;
const indexFile = () => path.join(dir(), "index.json");
const partOf = (file: string) => file.replace(/\.mp4$/, ".part.mp4");

function save() {
  fs.mkdirSync(dir(), { recursive: true });
  fs.writeFileSync(indexFile(), JSON.stringify([...S.recs.values()], null, 2));
}

function ensureLoaded() {
  if (S.loaded) return;
  S.loaded = true;
  try {
    const list = JSON.parse(fs.readFileSync(indexFile(), "utf8")) as Recording[];
    for (const r of list) {
      S.recs.set(r.id, r);
      if (r.status === "recording" || r.status === "finishing") {
        // Server restarted mid-recording: salvage whatever was written.
        salvage(r);
      } else if (r.status === "scheduled") {
        arm(r);
      }
    }
  } catch { /* no index yet */ }
}

function salvage(r: Recording) {
  const final = r.file ? path.join(dir(), r.file) : "";
  const part = final ? partOf(final) : "";
  if (final && fs.existsSync(final)) { r.status = "done"; }
  else if (part && fs.existsSync(part) && fs.statSync(part).size > 0) {
    fs.renameSync(part, final);
    r.status = "done";
    r.error = "Interrupted (server stopped) — partial recording kept";
  } else { r.status = "failed"; r.error = "Interrupted before any data was written"; }
  r.end ??= Date.now();
  try { r.size = fs.statSync(final).size; } catch { /* none */ }
  save();
}

const pad = (n: number) => String(n).padStart(2, "0");
function fileNameFor(r: Recording, t: number) {
  const d = new Date(t);
  const stamp = `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}`;
  const safe = r.name.replace(/[^\p{L}\p{N} _.-]+/gu, "").replace(/\s+/g, "_").slice(0, 60) || "Recording";
  return `${safe}_${stamp}_${r.id}.mp4`;
}

function arm(r: Recording) {
  clearTimeout(S.timers.get(r.id));
  const wait = (r.scheduledStart ?? Date.now()) - Date.now();
  if (wait <= 0) {
    // Missed while the server was down: start now if still inside the window, else mark failed.
    const endAt = (r.scheduledStart ?? 0) + (r.durationMin ?? 0) * 60_000;
    if (r.durationMin && Date.now() >= endAt) {
      r.status = "failed";
      r.error = "Missed: the player wasn't running at the scheduled time";
      save();
    } else begin(r.id);
    return;
  }
  S.timers.set(r.id, setTimeout(() => (wait > MAX_TIMER_MS ? arm(r) : begin(r.id)), Math.min(wait, MAX_TIMER_MS)));
}

function begin(id: string) {
  const r = S.recs.get(id);
  if (!r || (r.status !== "scheduled" && r.status !== "recording")) return;
  S.timers.delete(id);
  const ffmpeg = findFfmpeg();
  if (!ffmpeg) {
    r.status = "failed";
    r.error = "ffmpeg is not installed";
    save();
    return;
  }
  const now = Date.now();
  r.start = now;
  r.status = "recording";
  r.file = fileNameFor(r, now);
  // Remaining time for timers that started late.
  let seconds: number | undefined;
  if (r.durationMin) {
    const endAt = (r.scheduledStart ?? now) + r.durationMin * 60_000;
    seconds = Math.max(5, Math.round((endAt - now) / 1000));
  }
  fs.mkdirSync(dir(), { recursive: true });
  const part = partOf(path.join(dir(), r.file));
  const videoArgs = r.mode === "video"
    ? ["-vf", "yadif=0,scale=-2:720", "-c:v", "libx264", "-preset", "veryfast", "-profile:v", "main", "-pix_fmt", "yuv420p", "-b:v", "3000k", "-maxrate", "3500k", "-bufsize", "6000k"]
    : ["-c:v", "copy"];
  const args = [
    "-hide_banner", "-loglevel", "error",
    "-user_agent", UPSTREAM_UA,
    "-reconnect", "1", "-reconnect_streamed", "1", "-reconnect_delay_max", "5",
    "-fflags", "+genpts+discardcorrupt",
    "-i", r.streamUrl,
    "-map", "0:v:0?", "-map", "0:a:0?",
    ...videoArgs,
    "-af", "aresample=async=1",
    "-c:a", "aac", "-b:a", "160k", "-ac", "2",
    ...(seconds ? ["-t", String(seconds)] : []),
    "-f", "mp4", "-movflags", "+frag_keyframe+empty_moov+default_base_moof",
    "-y", part,
  ];
  const proc = spawn(ffmpeg, args, { stdio: ["pipe", "ignore", "pipe"], windowsHide: true });
  let stderr = "";
  proc.stderr?.on("data", (d: Buffer) => { stderr = (stderr + d.toString()).slice(-600); });
  proc.on("error", (e) => { r.error = e.message; });
  proc.on("close", () => {
    S.procs.delete(id);
    if (r.status === "cancelled") return;
    finalize(r, stderr.trim());
  });
  S.procs.set(id, proc);
  save();
}

function finalize(r: Recording, ffmpegErr: string) {
  r.status = "finishing";
  r.end = Date.now();
  save();
  const final = path.join(dir(), r.file!);
  const part = partOf(final);
  const partSize = fs.existsSync(part) ? fs.statSync(part).size : 0;
  if (partSize < 4096) {
    try { fs.unlinkSync(part); } catch { /* none */ }
    r.status = "failed";
    r.error = ffmpegErr ? ffmpegErr.split(/\r?\n/).pop()!.replace(/https?:\/\/\S+/g, "<stream>") : "No data received from the stream";
    save();
    return;
  }
  const ffmpeg = findFfmpeg()!;
  // Remux fragmented MP4 -> regular MP4 with the index up front (fast seeking).
  const p = spawn(ffmpeg, ["-hide_banner", "-loglevel", "error", "-i", part, "-c", "copy", "-movflags", "+faststart", "-y", final], { stdio: "ignore", windowsHide: true });
  p.on("close", (code) => {
    if (code === 0 && fs.existsSync(final)) { try { fs.unlinkSync(part); } catch { /* ignore */ } }
    else { try { fs.renameSync(part, final); } catch { /* ignore */ } }
    try { r.size = fs.statSync(final).size; } catch { /* ignore */ }
    r.status = "done";
    save();
  });
}

// ---------- public API ----------

export function listRecordings(): PublicRecording[] {
  ensureLoaded();
  return [...S.recs.values()]
    .map(({ streamUrl: _omit, ...r }) => {
      void _omit;
      const pub: PublicRecording = { ...r };
      if (r.status === "recording" && r.file) {
        try { pub.size = fs.statSync(partOf(path.join(dir(), r.file))).size; } catch { /* not yet */ }
      }
      if (r.durationMin) pub.plannedEnd = (r.scheduledStart ?? r.start ?? Date.now()) + r.durationMin * 60_000;
      return pub;
    })
    .sort((a, b) => (b.start ?? b.scheduledStart ?? 0) - (a.start ?? a.scheduledStart ?? 0));
}

export function createRecording(opts: {
  name: string; number?: number; streamUrl: string; mode: RecMode; startAt?: number; durationMin?: number;
}): PublicRecording {
  ensureLoaded();
  const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  const r: Recording = {
    id, name: opts.name, number: opts.number, streamUrl: opts.streamUrl, mode: opts.mode,
    status: "scheduled", scheduledStart: opts.startAt ?? Date.now(), durationMin: opts.durationMin,
  };
  S.recs.set(id, r);
  save();
  if (!opts.startAt || opts.startAt <= Date.now() + 1000) begin(id);
  else arm(r);
  return listRecordings().find((x) => x.id === id)!;
}

export function stopRecording(id: string) {
  ensureLoaded();
  const r = S.recs.get(id);
  if (!r) return false;
  if (r.status === "scheduled") {
    clearTimeout(S.timers.get(id));
    S.timers.delete(id);
    S.recs.delete(id);
    save();
    return true;
  }
  const proc = S.procs.get(id);
  if (!proc) return false;
  // 'q' asks ffmpeg to finish cleanly; force-kill if it doesn't.
  try { proc.stdin?.write("q"); } catch { /* ignore */ }
  setTimeout(() => { if (proc.exitCode === null) proc.kill("SIGKILL"); }, 5000);
  return true;
}

export function deleteRecording(id: string) {
  ensureLoaded();
  const r = S.recs.get(id);
  if (!r) return false;
  clearTimeout(S.timers.get(id));
  S.timers.delete(id);
  const proc = S.procs.get(id);
  if (proc) { r.status = "cancelled"; proc.kill("SIGKILL"); }
  if (r.file) {
    const final = path.join(dir(), r.file);
    // the process may still hold the file briefly on Windows
    setTimeout(() => { for (const f of [final, partOf(final)]) { try { fs.unlinkSync(f); } catch { /* gone */ } } }, proc ? 800 : 0);
  }
  S.recs.delete(id);
  save();
  return true;
}

export function recordingFile(id: string): string | null {
  ensureLoaded();
  const r = S.recs.get(id);
  if (!r?.file || r.status !== "done") return null;
  return path.join(dir(), r.file);
}
