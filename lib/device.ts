"use client";
/**
 * Device identity for MAG-style portals. Each browser/device gets its own random MAC
 * with the MAG prefix 00:1A:79 (what Xtream UI / Stalker panels expect for MAG devices).
 * It is created once and kept in this browser's storage, like a box's burned-in MAC.
 */
const LS_MAC = "mirax.mac";
const LS_PORTAL = "mirax.portal";

export function deviceMac(): string {
  try {
    const saved = localStorage.getItem(LS_MAC);
    if (saved && /^([0-9A-F]{2}:){5}[0-9A-F]{2}$/.test(saved)) return saved;
  } catch { /* storage blocked: fall through and generate (won't persist) */ }
  const bytes = new Uint8Array(3);
  crypto.getRandomValues(bytes);
  const mac = ["00", "1A", "79", ...Array.from(bytes, (b) => b.toString(16).padStart(2, "0").toUpperCase())].join(":");
  try { localStorage.setItem(LS_MAC, mac); } catch { /* ignore */ }
  return mac;
}

export interface PortalConfig { portal: string; mac: string; host: string }

export function savedPortal(): PortalConfig | null {
  try { return JSON.parse(localStorage.getItem(LS_PORTAL) || "null"); } catch { return null; }
}
export function savePortal(c: PortalConfig) {
  try { localStorage.setItem(LS_PORTAL, JSON.stringify(c)); } catch { /* ignore */ }
}

export const PORTAL_SOURCE_PREFIX = "MAC portal · ";

interface PortalChannel { name: string; number: number; cmd: string; group: string; logo?: string }

/** Build an M3U from portal channels; each entry points at our resolver so links are fresh at play time. */
export function portalToM3U(portal: string, mac: string, channels: PortalChannel[]): string {
  const esc = (s: string) => s.replace(/"/g, "'").replace(/[\r\n]+/g, " ");
  const lines = ["#EXTM3U"];
  for (const c of channels) {
    const url = `/api/stalker/play?p=${encodeURIComponent(portal)}&m=${encodeURIComponent(mac)}&c=${encodeURIComponent(c.cmd)}`;
    lines.push(`#EXTINF:-1 tvg-name="${esc(c.name)}"${c.logo ? ` tvg-logo="${esc(c.logo)}"` : ""} group-title="${esc(c.group)}",${esc(c.name)}`, url);
  }
  return lines.join("\n");
}

/** Server-relative stream URLs (portal channels, files) made absolute for the proxy / ffmpeg. */
export function absoluteUrl(u: string): string {
  return u.startsWith("/") ? `${window.location.origin}${u}` : u;
}
