"use client";
import { useEffect, useRef, useState } from "react";
import { fmtBytes } from "@/lib/pvr-client";
import { useStore } from "@/lib/store";
import { Backdrop } from "./HomeMenu";
import { Panel, Toast } from "./PvrScreen";
import { Clock, LabelKey } from "./ui";

type Source = "recordings" | "media" | "computer";
const SOURCES: { id: Source; label: string; hint: string }[] = [
  { id: "recordings", label: "Recordings", hint: "Programmes recorded with PVR Manager" },
  { id: "media", label: "Videos", hint: "Your Videos folder (set MEDIA_DIR to change it)" },
  { id: "computer", label: "This computer", hint: "Pick any video, audio or playlist file" },
];

interface Entry { name: string; dir: boolean; size: number; mtime: number; kind: "folder" | "video" | "audio" | "playlist" }
interface Listing { rootPath: string; path: string; entries: Entry[]; error?: string }

const ROWS = 9;

export default function FileListScreen() {
  const [src, setSrc] = useState<Source>("recordings");
  const [path, setPath] = useState("");
  const [listing, setListing] = useState<Listing | null>(null);
  const [loading, setLoading] = useState(false);
  const [cursor, setCursor] = useState(0);
  const [toast, setToast] = useState("");
  const pick = useRef<HTMLInputElement>(null);

  const flash = (m: string) => { setToast(m); window.setTimeout(() => setToast(""), 2200); };

  useEffect(() => {
    if (src === "computer") { setListing(null); return; }
    let cancelled = false;
    setLoading(true);
    fetch(`/api/files?root=${src}&path=${encodeURIComponent(path)}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((j: Listing) => { if (!cancelled) { setListing(j); setCursor(0); } })
      .catch(() => !cancelled && setListing({ rootPath: "", path, entries: [], error: "Couldn't read folder" }))
      .finally(() => !cancelled && setLoading(false));
    return () => { cancelled = true; };
  }, [src, path]);

  const entries = listing?.entries ?? [];
  const rawUrl = (name: string) => `/api/files?root=${src}&path=${encodeURIComponent(path ? `${path}/${name}` : name)}&raw=1`;

  const open = async (e: Entry) => {
    const s = useStore.getState();
    if (e.dir) { setPath(path ? `${path}/${e.name}` : e.name); return; }
    if (e.kind === "playlist") {
      try {
        const text = await (await fetch(rawUrl(e.name))).text();
        const n = s.loadPlaylist(text, e.name);
        if (n) { flash(`Loaded ${n} channels`); s.setView("tv"); } else flash("No channels found in that playlist");
      } catch { flash("Couldn't read playlist"); }
      return;
    }
    s.playVod({ id: `file-${src}-${path}/${e.name}`, number: 0, name: e.name.replace(/\.[^.]+$/, ""), url: rawUrl(e.name), group: "Files", vod: "native" }, "files");
  };

  const openLocal = async (f: File | undefined) => {
    if (!f) return;
    const s = useStore.getState();
    if (/\.m3u8?$/i.test(f.name)) {
      const n = s.loadPlaylist(await f.text(), f.name);
      if (n) s.setView("tv"); else flash("No channels found in that playlist");
      return;
    }
    s.playVod({ id: `local-${f.name}-${f.size}`, number: 0, name: f.name.replace(/\.[^.]+$/, ""), url: URL.createObjectURL(f), group: "Files", vod: "native" }, "files");
  };

  const up = () => setPath((p) => p.split("/").slice(0, -1).join("/"));

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (useStore.getState().overlay) return;
      const k = e.key;
      const si = SOURCES.findIndex((x) => x.id === src);
      let handled = true;
      if (k === "ArrowLeft" || k === "ArrowRight") {
        const next = SOURCES[(si + (k === "ArrowLeft" ? -1 : 1) + SOURCES.length) % SOURCES.length].id;
        setSrc(next); setPath(""); setCursor(0);
      } else if (k === "ArrowUp") setCursor((c) => Math.max(0, c - 1));
      else if (k === "ArrowDown") setCursor((c) => Math.min(entries.length - 1, c + 1));
      else if (k === "PageUp") setCursor((c) => Math.max(0, c - ROWS));
      else if (k === "PageDown") setCursor((c) => Math.min(entries.length - 1, c + ROWS));
      else if (k === "Enter") {
        if (src === "computer") pick.current?.click();
        else if (entries[cursor]) open(entries[cursor]);
      } else if (k === "Backspace") {
        if (path) up(); else useStore.getState().setView("home");
      } else if (k === "Escape") useStore.getState().setView("home");
      else handled = false;
      if (handled) e.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const start = Math.max(0, Math.min(cursor - 3, entries.length - ROWS));
  const visible = entries.slice(start, start + ROWS);
  const sel = entries[cursor];

  return (
    <div className="mx-view-in absolute inset-0 overflow-hidden text-white">
      <Backdrop />
      <Clock className="absolute right-[4.6%] top-[7.2%]" />
      <div className="absolute left-[4.6%] top-[7.5%] text-[2.6cqw] font-semibold drop-shadow-[0_0.15cqw_0.3cqw_rgba(0,0,40,.4)]">File List</div>

      {/* source tabs */}
      <div className="absolute left-[4.6%] top-[15%] flex gap-[0.8cqw]">
        {SOURCES.map((s) => {
          const active = s.id === src;
          return (
            <button
              key={s.id}
              tabIndex={-1}
              onClick={() => { setSrc(s.id); setPath(""); setCursor(0); }}
              className="rounded-t-[0.7cqw] px-[1.6cqw] py-[0.6cqw] text-[1.3cqw] font-semibold"
              style={{
                background: active ? "linear-gradient(180deg,#3cf03c,#18c722)" : "rgba(14,28,110,.45)",
                color: active ? "#05300a" : "rgba(255,255,255,.8)",
                transition: "background 150ms",
              }}
            >
              {s.label}
            </button>
          );
        })}
      </div>

      <Panel>
        {src === "computer" ? (
          <div className="flex h-full flex-col items-center justify-center gap-[1.4cqw] text-center">
            <FileIcon kind="folder" big />
            <div className="text-[1.6cqw] font-semibold">Open a file from this computer</div>
            <div className="max-w-[60%] text-[1.2cqw] leading-[1.6] text-white/75">
              MP4 and WebM play directly with seeking. Other formats (MKV, AVI, TS) play through ffmpeg when they come from the Recordings or Videos folders.
              Choosing an .m3u file loads it as your playlist.
            </div>
            <button
              tabIndex={-1}
              onClick={() => pick.current?.click()}
              className="mt-[0.6cqw] rounded-[0.6cqw] px-[2cqw] py-[0.8cqw] text-[1.4cqw] font-semibold text-[#05300a]"
              style={{ background: "linear-gradient(180deg,#3cf03c,#18c722)", boxShadow: "0 0 1.2cqw rgba(60,240,60,.45)" }}
            >
              Choose file… (OK)
            </button>
          </div>
        ) : (
          <>
            {/* breadcrumb */}
            <div className="absolute left-[2%] right-[2%] top-[3%] flex items-center gap-[0.6cqw] truncate text-[1.15cqw] text-white/70">
              <span className="font-semibold text-[#9fe4ff]">{SOURCES.find((x) => x.id === src)!.label}</span>
              {path.split("/").filter(Boolean).map((p, i) => <span key={i}>› {p}</span>)}
              <span className="ml-auto truncate text-[1cqw] text-white/45">{listing?.rootPath}</span>
            </div>

            <div className="absolute bottom-[3%] left-[2%] right-[2%] top-[10%]">
              {loading && !listing && <div className="mt-[3cqw] text-center text-[1.3cqw] text-white/70">Loading…</div>}
              {listing && entries.length === 0 && (
                <div className="mt-[3cqw] text-center text-[1.35cqw] leading-[1.8] text-white/75">
                  {listing.error ?? (src === "recordings" ? "No recordings yet — use PVR Manager to record." : "No video, audio or playlist files here.")}
                </div>
              )}
              {visible.map((e, i) => {
                const idx = start + i;
                const active = idx === cursor;
                return (
                  <div
                    key={e.name}
                    onClick={() => { setCursor(idx); if (useStore.getState().touch) void open(e); }}
                    onDoubleClick={() => open(e)}
                    className="flex h-[11%] cursor-pointer items-center gap-[1cqw] rounded-[0.6cqw] px-[1.2cqw] text-[1.35cqw]"
                    style={{
                      background: active ? "linear-gradient(90deg,#11b5ec 0%,#16c6f2 75%,rgba(22,198,242,.6) 100%)" : "transparent",
                      boxShadow: active ? "0 0 1cqw rgba(30,200,255,.45)" : "none",
                    }}
                  >
                    <FileIcon kind={e.kind} />
                    <span className="flex-1 truncate">{e.name}</span>
                    <span className="w-[16%] text-right text-[1.15cqw] text-white/80">{e.dir ? "" : fmtBytes(e.size)}</span>
                    <span className="w-[20%] text-right text-[1.15cqw] text-white/70">
                      {e.mtime ? new Date(e.mtime).toLocaleDateString(undefined, { day: "2-digit", month: "short", year: "numeric" }) : ""}
                    </span>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </Panel>

      <input
        ref={pick}
        type="file"
        hidden
        accept="video/*,audio/*,.mkv,.ts,.m3u,.m3u8"
        onChange={(e) => { openLocal(e.target.files?.[0]); e.target.value = ""; }}
      />

      {toast && <Toast>{toast}</Toast>}

      <div className="absolute bottom-[4.5%] left-[4.6%] right-[4.6%] flex items-center justify-center gap-[2.6cqw] text-[1.2cqw] text-white/90">
        <span className="flex items-center gap-[0.6cqw]"><LabelKey>◀▶</LabelKey> Source</span>
        <span className="flex items-center gap-[0.6cqw]"><LabelKey>▲▼</LabelKey> Select</span>
        <span className="flex items-center gap-[0.6cqw]"><LabelKey>OK</LabelKey> {sel?.dir ? "Open folder" : sel?.kind === "playlist" ? "Load playlist" : "Play"}</span>
        <span className="flex items-center gap-[0.6cqw]"><LabelKey>⌫</LabelKey> Up a folder</span>
        <span className="flex items-center gap-[0.6cqw]"><LabelKey>Esc</LabelKey> Back</span>
      </div>
    </div>
  );
}

function FileIcon({ kind, big = false }: { kind: Entry["kind"]; big?: boolean }) {
  const cls = big ? "h-[6cqw] w-[6cqw]" : "h-[2.2cqw] w-[2.2cqw] shrink-0";
  if (kind === "folder")
    return (
      <svg viewBox="0 0 24 24" className={cls}>
        <path d="M2 6a2 2 0 0 1 2-2h5l2 2h9a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2z" fill="#ffd34d" />
        <path d="M2 9h20v9a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2z" fill="#ffe27a" />
      </svg>
    );
  if (kind === "playlist")
    return (
      <svg viewBox="0 0 24 24" className={cls}>
        <rect x="3" y="3" width="18" height="18" rx="3" fill="#b6f5b6" />
        <path d="M7 8h10M7 12h10M7 16h6" stroke="#167a1c" strokeWidth="2" strokeLinecap="round" />
      </svg>
    );
  if (kind === "audio")
    return (
      <svg viewBox="0 0 24 24" className={cls}>
        <rect x="3" y="3" width="18" height="18" rx="3" fill="#ffd6f2" />
        <path d="M10 16.5V7l7-1.5V15" stroke="#9c2a7c" strokeWidth="2" fill="none" />
        <circle cx="8.5" cy="16.5" r="2" fill="#9c2a7c" /><circle cx="15.5" cy="15" r="2" fill="#9c2a7c" />
      </svg>
    );
  return (
    <svg viewBox="0 0 24 24" className={cls}>
      <rect x="2" y="4" width="20" height="16" rx="3" fill="#cfe7ff" />
      <path d="M10 9v6l5-3z" fill="#1f6fe0" />
    </svg>
  );
}
