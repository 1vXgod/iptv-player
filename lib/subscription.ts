"use client";
import { useEffect, useState } from "react";
import { PORTAL_SOURCE_PREFIX, savedPortal } from "./device";
import type { Channel } from "./m3u";
import { useStore } from "./store";

export interface Creds { base: string; username: string; password: string }

/** Find Xtream-Codes credentials from the playlist URL or, failing that, a channel URL. */
export function findCreds(source: string, channels: Channel[]): Creds | null {
  try {
    const u = new URL(source);
    const username = u.searchParams.get("username");
    const password = u.searchParams.get("password");
    if (username && password) return { base: u.origin, username, password };
  } catch { /* not a URL (file / sample) */ }
  for (const c of channels.slice(0, 20)) {
    const m = c.url.match(/^(https?:\/\/[^/]+)\/(?:live\/|movie\/|series\/)?([^/]+)\/([^/]+)\/\d+(?:\.\w+)?$/);
    if (m) return { base: m[1], username: decodeURIComponent(m[2]), password: decodeURIComponent(m[3]) };
  }
  return null;
}

export interface Account {
  status?: string;
  exp_date?: string | number | null;
  created_at?: string | number | null;
  is_trial?: string | number;
  active_cons?: string | number;
  max_connections?: string | number;
  message?: string;
}

export type Load =
  | { state: "loading" }
  | { state: "none" }
  | { state: "error"; msg: string }
  | { state: "ok"; acc: Account; timezone?: string };

export const fmtDate = (sec: number) =>
  new Date(sec * 1000).toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" });

/** Subscription info for the current playlist: Xtream `player_api.php` or the MAC portal's account info. */
export function useSubscription() {
  const source = useStore((s) => s.playlistSource);
  const channels = useStore((s) => s.channels);
  const [load, setLoad] = useState<Load>({ state: "loading" });
  const [nonce, setNonce] = useState(0);
  const creds = findCreds(source, channels);
  const portal = source.startsWith(PORTAL_SOURCE_PREFIX) ? savedPortal() : null;

  // MAC portal subscription
  useEffect(() => {
    if (!portal) return;
    let cancelled = false;
    setLoad({ state: "loading" });
    fetch("/api/stalker", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "account", portal: portal.portal, mac: portal.mac }) })
      .then(async (r) => {
        const j = await r.json();
        if (!r.ok) throw new Error(j.error || `HTTP ${r.status}`);
        const a = j.account as { expires?: string; status?: string; tariff?: string };
        const parsed = a.expires && !/unlimited/i.test(a.expires) ? Date.parse(a.expires) : NaN;
        const acc: Account = {
          status: a.status || "Active",
          exp_date: Number.isFinite(parsed) ? Math.floor(parsed / 1000) : null,
          message: a.tariff ? `Package: ${a.tariff}` : undefined,
        };
        if (!cancelled) setLoad({ state: "ok", acc });
      })
      .catch((e) => !cancelled && setLoad({ state: "error", msg: (e as Error).message }));
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [portal?.portal, portal?.mac, nonce]);

  // Xtream Codes subscription
  useEffect(() => {
    if (portal) return;
    if (!creds) { setLoad({ state: "none" }); return; }
    let cancelled = false;
    setLoad({ state: "loading" });
    const api = `${creds.base}/player_api.php?username=${encodeURIComponent(creds.username)}&password=${encodeURIComponent(creds.password)}`;
    fetch(`/api/proxy?url=${encodeURIComponent(api)}`)
      .then(async (r) => {
        if (!r.ok) throw new Error(`Provider answered HTTP ${r.status}`);
        const j = await r.json();
        if (!j || typeof j !== "object" || !j.user_info) throw new Error("Provider did not return account info");
        if (!cancelled) setLoad({ state: "ok", acc: j.user_info as Account, timezone: j.server_info?.timezone });
      })
      .catch((e) => !cancelled && setLoad({ state: "error", msg: (e as Error).message }));
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [creds?.base, creds?.username, creds?.password, nonce]);

  return { load, creds, portal, refresh: () => setNonce((n) => n + 1) };
}
