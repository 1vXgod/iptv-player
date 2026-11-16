/** Server-side helpers: media folders, safe path resolution, and Range-capable file serving. */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { Readable } from "node:stream";

export type RootId = "recordings" | "media";

export function mediaRoots(): Record<RootId, string> {
  return {
    recordings: path.resolve(process.env.RECORDINGS_DIR || path.join(process.cwd(), "recordings")),
    media: path.resolve(process.env.MEDIA_DIR || path.join(os.homedir(), "Videos")),
  };
}

/** Resolve `rel` inside `root`, refusing anything that escapes it (../, absolute paths, etc.). */
export function safeResolve(root: string, rel: string | null | undefined): string | null {
  const base = path.resolve(root);
  const p = path.resolve(base, rel || ".");
  if (p !== base && !p.startsWith(base + path.sep)) return null;
  return p;
}

const TYPES: Record<string, string> = {
  ".mp4": "video/mp4", ".m4v": "video/mp4", ".mov": "video/quicktime", ".webm": "video/webm",
  ".mkv": "video/x-matroska", ".ts": "video/mp2t", ".m2ts": "video/mp2t", ".mts": "video/mp2t",
  ".avi": "video/x-msvideo", ".wmv": "video/x-ms-wmv", ".flv": "video/x-flv", ".mpg": "video/mpeg", ".mpeg": "video/mpeg",
  ".mp3": "audio/mpeg", ".aac": "audio/aac", ".m4a": "audio/mp4", ".wav": "audio/wav", ".flac": "audio/flac", ".ogg": "audio/ogg",
  ".m3u": "audio/x-mpegurl", ".m3u8": "application/vnd.apple.mpegurl",
};
export const mimeOf = (p: string) => TYPES[path.extname(p).toLowerCase()] || "application/octet-stream";

export type FileKind = "video" | "audio" | "playlist" | "other";
export function kindOf(name: string): FileKind {
  const ext = path.extname(name).toLowerCase();
  if ([".m3u", ".m3u8"].includes(ext)) return "playlist";
  const t = TYPES[ext] || "";
  return t.startsWith("video/") ? "video" : t.startsWith("audio/") ? "audio" : "other";
}

/** Stream a file with HTTP Range support (needed for seeking in <video>). */
export function serveFile(filePath: string, req: Request, downloadName?: string): Response {
  let stat: fs.Stats;
  try { stat = fs.statSync(filePath); } catch { return new Response("Not found", { status: 404 }); }
  if (!stat.isFile()) return new Response("Not a file", { status: 400 });
  const size = stat.size;
  const headers: Record<string, string> = {
    "Content-Type": mimeOf(filePath),
    "Accept-Ranges": "bytes",
    "Cache-Control": "no-store",
  };
  if (downloadName) headers["Content-Disposition"] = `inline; filename="${downloadName.replace(/"/g, "")}"`;

  const range = req.headers.get("range");
  const m = range?.match(/bytes=(\d*)-(\d*)/);
  if (m && size > 0) {
    let start = m[1] ? parseInt(m[1], 10) : NaN;
    let end = m[2] ? parseInt(m[2], 10) : size - 1;
    if (Number.isNaN(start)) { start = Math.max(0, size - end); end = size - 1; } // suffix range
    end = Math.min(end, size - 1);
    if (start > end || start >= size) {
      return new Response(null, { status: 416, headers: { ...headers, "Content-Range": `bytes */${size}` } });
    }
    const stream = Readable.toWeb(fs.createReadStream(filePath, { start, end })) as ReadableStream;
    return new Response(stream, {
      status: 206,
      headers: { ...headers, "Content-Range": `bytes ${start}-${end}/${size}`, "Content-Length": String(end - start + 1) },
    });
  }
  const stream = Readable.toWeb(fs.createReadStream(filePath)) as ReadableStream;
  return new Response(stream, { headers: { ...headers, "Content-Length": String(size) } });
}
