/**
 * File List API (local media browser). Only paths inside the configured roots are reachable.
 *   GET /api/files?root=media|recordings&path=<relative dir>          -> directory listing
 *   GET /api/files?root=...&path=<relative file>&raw=1                -> the file (Range supported)
 */
import fs from "node:fs";
import path from "node:path";
import { kindOf, mediaRoots, RootId, safeResolve, serveFile } from "@/lib/media";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const q = new URL(req.url).searchParams;
  const rootId = (q.get("root") || "media") as RootId;
  const roots = mediaRoots();
  if (!(rootId in roots)) return Response.json({ error: "Unknown root" }, { status: 400 });
  const root = roots[rootId];
  const target = safeResolve(root, q.get("path"));
  if (!target) return Response.json({ error: "Path outside media folder" }, { status: 403 });

  if (q.get("raw")) return serveFile(target, req, path.basename(target));

  if (rootId === "recordings") fs.mkdirSync(root, { recursive: true });
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(target, { withFileTypes: true });
  } catch {
    return Response.json({ root: rootId, rootPath: root, path: q.get("path") || "", entries: [], error: "Folder not found" });
  }
  const list = entries
    .filter((e) => !e.name.startsWith(".") && e.name !== "index.json" && !e.name.endsWith(".part.mp4") && e.name !== "desktop.ini")
    .map((e) => {
      const full = path.join(target, e.name);
      let size = 0, mtime = 0;
      try { const st = fs.statSync(full); size = st.size; mtime = st.mtimeMs; } catch { /* unreadable */ }
      const dir = e.isDirectory();
      return { name: e.name, dir, size, mtime, kind: dir ? "folder" : kindOf(e.name) };
    })
    .filter((e) => e.dir || e.kind !== "other")
    .sort((a, b) => (a.dir === b.dir ? a.name.localeCompare(b.name, undefined, { numeric: true }) : a.dir ? -1 : 1));

  return Response.json({ root: rootId, rootPath: root, path: path.relative(root, target).split(path.sep).join("/"), entries: list });
}
