/** Locate an ffmpeg executable (server side). Re-checks periodically so installing it later works without code changes. */
import fs from "node:fs";
import path from "node:path";

let cached: string | null = null;
let checkedAt = 0;

function candidates(): string[] {
  const exe = process.platform === "win32" ? "ffmpeg.exe" : "ffmpeg";
  const list: string[] = [];
  if (process.env.FFMPEG_PATH) list.push(process.env.FFMPEG_PATH);
  for (const dir of (process.env.PATH || "").split(path.delimiter)) if (dir) list.push(path.join(dir, exe));
  const lad = process.env.LOCALAPPDATA;
  if (lad) {
    // winget installs (PATH may not be refreshed in an already-running terminal)
    list.push(path.join(lad, "Microsoft", "WinGet", "Links", exe));
    const pk = path.join(lad, "Microsoft", "WinGet", "Packages");
    try {
      for (const d of fs.readdirSync(pk)) {
        if (!/ffmpeg/i.test(d)) continue;
        for (const sub of fs.readdirSync(path.join(pk, d))) list.push(path.join(pk, d, sub, "bin", exe));
      }
    } catch { /* no winget dir */ }
  }
  if (process.platform === "win32") list.push("C:\\ffmpeg\\bin\\ffmpeg.exe", "C:\\Program Files\\ffmpeg\\bin\\ffmpeg.exe");
  return list;
}

export function findFfmpeg(): string | null {
  if (cached) return cached;
  if (Date.now() - checkedAt < 30_000) return null;
  checkedAt = Date.now();
  for (const c of candidates()) {
    try { if (fs.statSync(c).isFile()) return (cached = c); } catch { /* next */ }
  }
  return null;
}
