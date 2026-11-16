/**
 * Audio-only transcode: copies the video untouched and converts audio to AAC,
 * output as live MPEG-TS for mpegts.js. Needs ffmpeg (see lib/ffmpeg.ts).
 *
 *   GET /api/transcode?url=<encoded>
 */
import { spawn } from "node:child_process";
import { findFfmpeg } from "@/lib/ffmpeg";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UPSTREAM_UA = process.env.IPTV_USER_AGENT || "VLC/3.0.20 LibVLC/3.0.20";
const CORS = { "Access-Control-Allow-Origin": "*" };

export async function GET(req: Request) {
  const target = new URL(req.url).searchParams.get("url");
  if (!target || !/^https?:\/\//i.test(target)) {
    return Response.json({ error: "Missing or invalid url" }, { status: 400, headers: CORS });
  }
  const ffmpeg = findFfmpeg();
  if (!ffmpeg) return Response.json({ error: "ffmpeg not installed" }, { status: 501, headers: CORS });

  // mode=audio (default): copy video, audio -> AAC. Cheap.
  // mode=video: also deinterlace + re-encode video to 720p H.264 — for streams the
  // browser's decoder rejects (field-coded/PAFF interlaced H.264, MPEG-2, HEVC).
  const fullTranscode = new URL(req.url).searchParams.get("mode") === "video";
  const videoArgs = fullTranscode
    ? [
        "-vf", "yadif=0,scale=-2:720",
        "-c:v", "libx264", "-preset", "veryfast", "-tune", "zerolatency",
        "-profile:v", "main", "-pix_fmt", "yuv420p", "-g", "50",
        "-b:v", "3000k", "-maxrate", "3500k", "-bufsize", "6000k",
      ]
    : ["-c:v", "copy"];

  const proc = spawn(ffmpeg, [
    "-hide_banner", "-loglevel", "error", "-nostdin",
    "-user_agent", UPSTREAM_UA,
    "-reconnect", "1", "-reconnect_streamed", "1", "-reconnect_delay_max", "4",
    "-fflags", "+genpts+discardcorrupt",
    "-i", target,
    "-map", "0:v:0", "-map", "0:a:0?",
    ...videoArgs,
    "-af", "aresample=async=1",
    "-c:a", "aac", "-b:a", "128k", "-ac", "2",
    "-f", "mpegts", "pipe:1",
  ], { stdio: ["ignore", "pipe", "pipe"], windowsHide: true });

  let stderr = "";
  proc.stderr.on("data", (d: Buffer) => { stderr = (stderr + d.toString()).slice(-500); });
  const kill = () => { if (proc.exitCode === null) proc.kill("SIGKILL"); };
  req.signal.addEventListener("abort", kill);

  const body = new ReadableStream<Uint8Array>({
    start(ctl) {
      proc.stdout.on("data", (d: Buffer) => {
        try { ctl.enqueue(new Uint8Array(d)); } catch { kill(); }
      });
      proc.on("close", (code) => {
        if (code && stderr) console.warn(`[transcode] ffmpeg exited ${code}: ${stderr.trim()}`);
        try { ctl.close(); } catch { /* already closed */ }
      });
      proc.on("error", (e) => { try { ctl.error(e); } catch { /* closed */ } });
    },
    cancel: kill,
  });

  return new Response(body, { headers: { ...CORS, "Content-Type": "video/mp2t", "Cache-Control": "no-store" } });
}
