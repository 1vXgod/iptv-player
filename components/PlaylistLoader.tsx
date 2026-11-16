"use client";
import { useEffect, useRef, useState } from "react";
import { deviceMac, PORTAL_SOURCE_PREFIX, portalToM3U, savedPortal, savePortal } from "@/lib/device";
import { SAMPLE_PLAYLIST } from "@/lib/sample";
import { playlistDisplayName, useStore } from "@/lib/store";

type Tab = "m3u" | "xtream" | "mac";
const TABS: { id: Tab; label: string }[] = [
  { id: "m3u", label: "M3U Playlist" },
  { id: "xtream", label: "Xtream Login" },
  { id: "mac", label: "MAC Portal" },
];

/** "Installation" dialog: M3U (URL / file / sample), Xtream Codes login, or MAG-style MAC portal. */
export default function PlaylistLoader({ onDone }: { onDone: () => void }) {
  const loadPlaylist = useStore((s) => s.loadPlaylist);
  const source = useStore((s) => s.playlistSource);
  const count = useStore((s) => s.channels.length);
  const [tab, setTab] = useState<Tab>(() => (source.startsWith(PORTAL_SOURCE_PREFIX) ? "mac" : "m3u"));
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  // M3U
  const [url, setUrl] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  // Xtream
  const [xServer, setXServer] = useState("");
  const [xUser, setXUser] = useState("");
  const [xPass, setXPass] = useState("");
  // MAC portal
  const [mac, setMac] = useState("");
  const [portal, setPortal] = useState("");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    setMac(deviceMac());
    const p = savedPortal();
    if (p) setPortal(p.portal);
  }, []);

  const apply = (text: string, src: string) => {
    const n = loadPlaylist(text, src);
    if (n) { setMsg({ ok: true, text: `Loaded ${n} channels` }); onDone(); }
    else setMsg({ ok: false, text: "No channels found in playlist" });
    return n;
  };

  const fetchPlaylist = async (u: string) => {
    const get = async (target: string) => {
      const res = await fetch(target);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.text();
    };
    try { return await get(u); } catch { return get(`/api/proxy?url=${encodeURIComponent(u)}`); } // CORS fallback
  };

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setMsg(null);
    try { await fn(); } catch (e) { setMsg({ ok: false, text: (e as Error).message }); } finally { setBusy(false); }
  };

  const fromUrl = () => run(async () => {
    const u = url.trim();
    if (!u) return;
    try { apply(await fetchPlaylist(u), u); }
    catch (e) { throw new Error(`Could not fetch playlist (${(e as Error).message}). Try downloading it and using "Local file".`); }
  });

  const fromXtream = () => run(async () => {
    let server = xServer.trim().replace(/\/+$/, "");
    if (!server || !xUser.trim() || !xPass) throw new Error("Enter the server, username and password");
    if (!/^https?:\/\//i.test(server)) server = `http://${server}`;
    const u = `${server}/get.php?username=${encodeURIComponent(xUser.trim())}&password=${encodeURIComponent(xPass)}&type=m3u_plus&output=ts`;
    let text: string;
    try { text = await fetchPlaylist(u); } catch (e) { throw new Error(`Login failed (${(e as Error).message}). Check the server address and port.`); }
    if (!text.trimStart().startsWith("#EXTM3U")) throw new Error("Login failed — wrong username or password, or the account is disabled.");
    apply(text, u);
  });

  const fromPortal = () => run(async () => {
    const p = portal.trim();
    if (!p) throw new Error("Enter the portal URL from your panel");
    const r = await fetch("/api/stalker", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "login", portal: p, mac }) });
    const j = await r.json();
    if (!r.ok) throw new Error(j.error || `HTTP ${r.status}`);
    savePortal({ portal: p, mac, host: j.host });
    apply(portalToM3U(p, mac, j.channels), `${PORTAL_SOURCE_PREFIX}${j.host}`);
  });

  const copyMac = async () => {
    try { await navigator.clipboard.writeText(mac); setCopied(true); window.setTimeout(() => setCopied(false), 1500); } catch { /* clipboard blocked */ }
  };

  // ◀▶ switch tabs when the caret isn't in a text field
  const onKeyDown = (e: React.KeyboardEvent) => {
    if ((e.target as HTMLElement).tagName === "INPUT") return;
    if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
      const i = TABS.findIndex((t) => t.id === tab);
      setTab(TABS[(i + (e.key === "ArrowLeft" ? -1 : 1) + TABS.length) % TABS.length].id);
      setMsg(null);
      e.preventDefault();
    }
  };

  const btn = "rounded-[0.4cqw] px-[1.4cqw] py-[0.6cqw] text-[1.25cqw] font-semibold outline-none focus:ring-[0.25cqw] focus:ring-white disabled:opacity-60";
  const input = "min-w-0 flex-1 rounded-[0.4cqw] border border-white/40 bg-[#122a8a] px-[1cqw] py-[0.6cqw] text-[1.25cqw] outline-none placeholder:text-white/40 focus:border-white";
  const label = "mb-[0.4cqw] mt-[1cqw] block text-[1.15cqw] text-white/85";

  return (
    <div className="mx-fade-in absolute inset-0 z-40 flex items-center justify-center bg-black/55" onKeyDown={onKeyDown}>
      <div
        className="w-[60%] rounded-[0.8cqw] border border-[#5d7fd6] p-[2cqw] text-white shadow-2xl"
        style={{ background: "linear-gradient(180deg,#2a50e8 0%,#1d38b8 100%)" }}
      >
        <div className="mb-[1.2cqw] flex items-baseline justify-between">
          <h2 className="text-[2cqw] font-semibold">Installation</h2>
          <span className="max-w-[55%] truncate text-[1.05cqw] text-white/70">Current: {playlistDisplayName(source)} ({count})</span>
        </div>

        <div className="mb-[0.6cqw] flex gap-[0.6cqw] border-b border-white/20">
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => { setTab(t.id); setMsg(null); }}
              className={`-mb-px rounded-t-[0.5cqw] px-[1.4cqw] py-[0.6cqw] text-[1.25cqw] font-semibold outline-none ${tab === t.id ? "border border-b-0 border-white/30 bg-[#16c6f2] text-[#062033]" : "text-white/75 hover:text-white"}`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {tab === "m3u" && (
          <>
            <label className={label}>M3U / M3U8 URL</label>
            <div className="flex gap-[0.8cqw]">
              <input autoFocus value={url} onChange={(e) => setUrl(e.target.value)} onKeyDown={(e) => e.key === "Enter" && fromUrl()}
                placeholder="https://example.com/playlist.m3u" className={input} />
              <button onClick={fromUrl} disabled={busy} className={`${btn} bg-[#16c6f2] text-[#062033]`}>{busy ? "Loading…" : "Load"}</button>
            </div>
            <div className="mt-[1.4cqw] flex gap-[0.8cqw]">
              <button onClick={() => fileRef.current?.click()} className={`${btn} bg-[#1fdc2a] text-[#06300a]`}>Local file…</button>
              <button onClick={() => apply(SAMPLE_PLAYLIST, "Built-in sample")} className={`${btn} bg-[#f5dc12] text-[#3a3000]`}>Built-in sample</button>
              <input ref={fileRef} type="file" accept=".m3u,.m3u8,audio/x-mpegurl,application/vnd.apple.mpegurl,text/plain" hidden
                onChange={async (e) => { const f = e.target.files?.[0]; if (f) apply(await f.text(), f.name); }} />
            </div>
          </>
        )}

        {tab === "xtream" && (
          <div onKeyDown={(e) => e.key === "Enter" && fromXtream()}>
            <label className={label}>Server (with port)</label>
            <div className="flex"><input autoFocus value={xServer} onChange={(e) => setXServer(e.target.value)} placeholder="http://server.example.com:8080" className={input} /></div>
            <div className="flex gap-[1cqw]">
              <div className="flex-1">
                <label className={label}>Username</label>
                <div className="flex"><input value={xUser} onChange={(e) => setXUser(e.target.value)} autoComplete="off" className={input} /></div>
              </div>
              <div className="flex-1">
                <label className={label}>Password</label>
                <div className="flex"><input type="password" value={xPass} onChange={(e) => setXPass(e.target.value)} autoComplete="off" className={input} /></div>
              </div>
            </div>
            <div className="mt-[1.4cqw] flex items-center gap-[1cqw]">
              <button onClick={fromXtream} disabled={busy} className={`${btn} bg-[#16c6f2] text-[#062033]`}>{busy ? "Logging in…" : "Log in"}</button>
              <span className="text-[1.05cqw] text-white/65">Downloads your channel list from the panel (same as the M3U link).</span>
            </div>
          </div>
        )}

        {tab === "mac" && (
          <>
            <div className="mt-[1cqw] flex items-center gap-[1.6cqw] rounded-[0.6cqw] bg-black/20 p-[1.2cqw]">
              <div className="flex-1">
                <div className="text-[1.05cqw] uppercase tracking-[0.12em] text-white/65">This device&apos;s MAC address</div>
                <div className="mt-[0.3cqw] font-mono text-[2.6cqw] font-bold tracking-[0.08em] text-[#ffe27a]">{mac || "…"}</div>
              </div>
              <button onClick={copyMac} className={`${btn} bg-white/15`}>{copied ? "Copied ✓" : "Copy"}</button>
            </div>
            <ol className="mt-[0.9cqw] list-decimal pl-[2cqw] text-[1.1cqw] leading-[1.7] text-white/80">
              <li>In your Xtream UI panel, add a <b>MAG device</b> with this MAC address and give it a package.</li>
              <li>Enter the panel&apos;s portal URL below, usually <span className="font-mono text-white">http://your-server:port/c/</span></li>
            </ol>
            <label className={label}>Portal URL</label>
            <div className="flex gap-[0.8cqw]">
              <input autoFocus value={portal} onChange={(e) => setPortal(e.target.value)} onKeyDown={(e) => e.key === "Enter" && fromPortal()}
                placeholder="http://server.example.com:8080/c/" className={input} />
              <button onClick={fromPortal} disabled={busy || !mac} className={`${btn} bg-[#16c6f2] text-[#062033]`}>{busy ? "Connecting…" : "Connect"}</button>
            </div>
          </>
        )}

        <div className="mt-[1.4cqw] flex items-center">
          <span className="text-[1.05cqw] text-white/55">◀▶ switch tabs · Tab moves between fields</span>
          <button onClick={onDone} className={`${btn} ml-auto bg-white/15`}>Close (Esc)</button>
        </div>

        {msg && (
          <div className={`mt-[1cqw] rounded-[0.4cqw] px-[1cqw] py-[0.6cqw] text-[1.1cqw] ${msg.ok ? "bg-[#0f7a2a]/70" : "bg-[#7a1f1f]/70"}`}>
            {msg.text}
          </div>
        )}
      </div>
    </div>
  );
}

export function Placeholder({ title, onClose }: { title: string; onClose: () => void }) {
  return (
    <div className="absolute inset-0 z-40 flex items-center justify-center bg-black/55" onClick={onClose}>
      <div className="w-[40%] rounded-[0.8cqw] border border-[#5d7fd6] p-[2cqw] text-center text-white"
        style={{ background: "linear-gradient(180deg,#2a50e8 0%,#1d38b8 100%)" }}>
        <div className="text-[2cqw] font-semibold">{title}</div>
        <div className="mt-[1cqw] text-[1.3cqw] text-white/80">Not available in this player.</div>
        <div className="mt-[1.4cqw] text-[1.1cqw] text-white/60">Press OK or Esc to return</div>
      </div>
    </div>
  );
}
