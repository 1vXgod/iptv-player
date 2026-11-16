/**
 * Stalker / MAG portal client (server side).
 *
 * Xtream UI and other middleware let you register a MAG device by MAC address.
 * The box then talks to the panel's portal API (portal.php or server/load.php)
 * identifying itself with that MAC. This module speaks that protocol:
 * handshake -> get_profile -> get_genres / get_all_channels, and create_link
 * at play time (portal stream links are short-lived tokens).
 */
import crypto from "node:crypto";

const UA = "Mozilla/5.0 (QtEmbedded; U; Linux; C) AppleWebKit/533.3 (KHTML, like Gecko) MAG200 stbapp ver: 2 rev: 250 Safari/533.3";
const SESSION_TTL_MS = 30 * 60_000;

export class PortalError extends Error {}
/** The panel refused because the device's connection limit is in use. */
export class PortalLimitError extends PortalError {}

interface Session { endpoint: string; referer: string; token: string; at: number }
const G = globalThis as unknown as { __mxStalker?: Map<string, Session> };
const sessions: Map<string, Session> = (G.__mxStalker ??= new Map());

const hash = (alg: string, s: string) => crypto.createHash(alg).update(s).digest("hex").toUpperCase();

export function isValidMac(mac: string) {
  return /^([0-9A-F]{2}:){5}[0-9A-F]{2}$/i.test(mac);
}

/** Accepts "host:port", ".../c/", ".../stalker_portal/c/", or a direct portal.php/load.php URL. */
export function portalCandidates(input: string): { referer: string; endpoints: string[] } {
  let raw = input.trim();
  if (!/^https?:\/\//i.test(raw)) raw = `http://${raw}`;
  const url = new URL(raw);
  const path = url.pathname.replace(/\/+$/, "");
  const endpoints: string[] = [];
  if (/\.php$/i.test(path)) endpoints.push(url.origin + path);
  const base = url.origin + path.replace(/\/(c|c\/index\.html|portal\.php|server\/load\.php)$/i, "");
  endpoints.push(`${base}/portal.php`, `${base}/server/load.php`);
  if (!/stalker_portal/i.test(base)) endpoints.push(`${url.origin}/stalker_portal/server/load.php`);
  return { referer: `${base}/c/`, endpoints: [...new Set(endpoints)] };
}

async function call(s: { endpoint: string; referer: string; token?: string }, mac: string, params: Record<string, string>) {
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || "Europe/London";
  const q = new URLSearchParams({ ...params, JsHttpRequest: "1-xml" });
  const headers: Record<string, string> = {
    "User-Agent": UA,
    "X-User-Agent": "Model: MAG250; Link: WiFi",
    Referer: s.referer,
    Accept: "*/*",
    Cookie: `mac=${encodeURIComponent(mac)}; stb_lang=en; timezone=${encodeURIComponent(tz)}`,
  };
  if (s.token) headers.Authorization = `Bearer ${s.token}`;
  let r: Response;
  try {
    r = await fetch(`${s.endpoint}?${q}`, { headers, cache: "no-store", signal: AbortSignal.timeout(15000) });
  } catch (e) {
    throw new PortalError(`Portal unreachable (${(e as Error).message})`);
  }
  const text = await r.text();
  if (/authorization failed/i.test(text) || r.status === 401 || r.status === 403) {
    throw new PortalError(`Authorization failed — the MAC ${mac} isn't registered (or is disabled/expired) on this portal. Add it as a MAG device in your panel.`);
  }
  if (!r.ok) throw new PortalError(`Portal answered HTTP ${r.status}`);
  try {
    return JSON.parse(text).js;
  } catch {
    throw new PortalError(/authorization failed/i.test(text) ? "Authorization failed — is this MAC added to your panel?" : "Not a MAG portal response");
  }
}

async function openSession(portal: string, mac: string): Promise<Session> {
  const { referer, endpoints } = portalCandidates(portal);
  let lastErr = "Portal not found";
  for (const endpoint of endpoints) {
    try {
      const hs = await call({ endpoint, referer }, mac, { type: "stb", action: "handshake", token: "", prehash: "0" });
      if (!hs?.token) { lastErr = "Portal did not issue a token"; continue; }
      const s: Session = { endpoint, referer, token: hs.token, at: Date.now() };
      const sn = hash("md5", mac).slice(0, 13);
      const deviceId = hash("sha256", mac);
      await call(s, mac, {
        type: "stb", action: "get_profile", hd: "1", num_banks: "2", stb_type: "MAG250", client_type: "STB",
        image_version: "218", video_out: "hdmi", auth_second_step: "1", hw_version: "1.7-BD-00", not_valid_token: "0",
        sn, device_id: deviceId, device_id2: deviceId, signature: hash("sha256", sn + mac),
        ver: "ImageDescription: 0.2.18-r23-250; PORTAL version: 5.6.2; API Version: JS API version: 343",
        metrics: JSON.stringify({ mac, sn, type: "STB", model: "MAG250", uid: "", random: "" }),
        timestamp: String(Math.floor(Date.now() / 1000)), api_signature: "262", prehash: "",
      });
      return s;
    } catch (e) {
      lastErr = (e as Error).message;
    }
  }
  throw new PortalError(lastErr);
}

async function getSession(portal: string, mac: string, fresh = false) {
  const key = `${portal}|${mac.toUpperCase()}`;
  const cached = sessions.get(key);
  if (!fresh && cached && Date.now() - cached.at < SESSION_TTL_MS) return cached;
  const s = await openSession(portal, mac);
  sessions.set(key, s);
  return s;
}

/** Run a portal call, re-handshaking once if the session went stale. */
async function withSession<T>(portal: string, mac: string, fn: (s: Session) => Promise<T>): Promise<T> {
  try {
    return await fn(await getSession(portal, mac));
  } catch (e) {
    if (e instanceof PortalLimitError) throw e; // not a session problem
    return fn(await getSession(portal, mac, true));
  }
}

export interface PortalChannel { name: string; number: number; cmd: string; group: string; logo?: string }
export interface PortalAccount { expires?: string; status?: string; tariff?: string; login?: string }

export async function portalAccount(portal: string, mac: string): Promise<PortalAccount> {
  return withSession(portal, mac, async (s) => {
    const info = (await call(s, mac, { type: "account_info", action: "get_main_info" }).catch(() => null)) || {};
    // Xtream UI puts the expiry in "phone"; Ministra uses end_date / expire_billing_date.
    const expires = info.end_date || info.expire_billing_date || info.phone || undefined;
    return { expires: expires ? String(expires) : undefined, status: info.status_msg || undefined, tariff: info.tariff_plan || undefined, login: info.login || undefined };
  });
}

export async function portalLogin(portal: string, mac: string): Promise<{ channels: PortalChannel[]; account: PortalAccount; host: string }> {
  const s = await getSession(portal, mac, true);
  const host = new URL(s.endpoint).host;
  const genresJs = await call(s, mac, { type: "itv", action: "get_genres" }).catch(() => []);
  const genres = new Map<string, string>((Array.isArray(genresJs) ? genresJs : []).map((g: { id: string; title: string }) => [String(g.id), g.title]));
  const all = await call(s, mac, { type: "itv", action: "get_all_channels" });
  const list: Record<string, string>[] = Array.isArray(all) ? all : all?.data ?? [];
  if (!list.length) throw new PortalError("The portal returned no channels — check that this MAC is added and active in your panel.");
  const origin = new URL(s.endpoint).origin;
  const channels = list
    .map((c) => ({
      name: String(c.name || "Channel"),
      number: Number(c.number) || 0,
      cmd: String(c.cmd || ""),
      group: genres.get(String(c.tv_genre_id)) || "Live",
      logo: c.logo ? (/^https?:/i.test(c.logo) ? c.logo : `${origin}/${String(c.logo).replace(/^\/+/, "")}`) : undefined,
    }))
    .filter((c) => c.cmd)
    .sort((a, b) => (a.number || 1e9) - (b.number || 1e9));
  const account = await portalAccount(portal, mac).catch(() => ({}));
  return { channels, account, host };
}

/** Exchange a channel's cmd for a fresh, playable stream URL. */
export async function portalStreamUrl(portal: string, mac: string, cmd: string): Promise<string> {
  return withSession(portal, mac, async (s) => {
    let js: { cmd?: string; error?: string } | null = null;
    // "limit" = the device's connection(s) are still in use — usually the channel we just left,
    // which the panel takes a moment to release. Wait and retry before giving up.
    for (let attempt = 0; attempt < 16; attempt++) { // the panel can hold the slot ~10 s
      js = await call(s, mac, {
        type: "itv", action: "create_link", cmd, series: "", forced_storage: "undefined", disable_ad: "0", download: "0",
      });
      if (js?.error !== "limit") break;
      await new Promise((r) => setTimeout(r, 1000));
    }
    if (js?.error === "limit") {
      throw new PortalLimitError(
        "Connection limit reached for this MAC — another stream is using it (another device, or a recording of a different channel). Raise “max connections” for this MAG device in your panel.",
      );
    }
    const url = String(js?.cmd || "").replace(/^(ffmpeg|ffrt\d*|auto)\s+/i, "").trim();
    if (!/^https?:\/\//i.test(url)) {
      const got = JSON.stringify(js ?? null).slice(0, 300).replace(/(token|mac|play_token)=[^&"]*/gi, "$1=…");
      throw new PortalError(`Portal did not return a stream link (got ${got})`);
    }
    return url;
  });
}
