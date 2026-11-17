"use client";
import { useEffect, useState } from "react";
import { deviceMac, PORTAL_SOURCE_PREFIX, portalToM3U, savedPortal, savePortal } from "./device";
import { useStore } from "./store";

export type InstallTab = "m3u" | "xtream" | "mac";

/**
 * Everything the "Installation" forms need (M3U URL / Xtream login / MAG-style MAC portal),
 * shared by the TV dialog and the phone Playlist tab.
 */
export function useInstaller(onDone?: () => void) {
  const loadPlaylist = useStore((s) => s.loadPlaylist);
  const source = useStore((s) => s.playlistSource);
  const [tab, setTab] = useState<InstallTab>(() => (source.startsWith(PORTAL_SOURCE_PREFIX) ? "mac" : "m3u"));
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  // M3U
  const [url, setUrl] = useState("");
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
    if (n) { setMsg({ ok: true, text: `Loaded ${n} channels` }); onDone?.(); }
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

  const fromFile = async (f: File | undefined) => {
    if (f) apply(await f.text(), f.name);
  };

  const copyMac = async () => {
    try { await navigator.clipboard.writeText(mac); setCopied(true); window.setTimeout(() => setCopied(false), 1500); } catch { /* clipboard blocked */ }
  };

  return {
    tab, setTab, msg, setMsg, busy,
    url, setUrl, xServer, setXServer, xUser, setXUser, xPass, setXPass,
    mac, portal, setPortal, copied,
    apply, fromUrl, fromXtream, fromPortal, fromFile, copyMac,
  };
}
