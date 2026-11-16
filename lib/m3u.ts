export interface Channel {
  id: string;
  number: number;
  name: string;
  url: string;
  logo?: string;
  group: string;
  /** Set for recordings / local files: "native" plays directly (seekable), "convert" goes through ffmpeg. */
  vod?: "native" | "convert";
}

const ATTR_RE = /([\w-]+)="([^"]*)"/g;

/** Parse a standard M3U / M3U8 (extended) playlist into channels. */
export function parseM3U(text: string): Channel[] {
  const lines = text.replace(/^\uFEFF/, "").split(/\r?\n/);
  const out: Channel[] = [];
  let pending: { name: string; logo?: string; group?: string } | null = null;
  let extgrp: string | undefined;

  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;
    if (line.startsWith("#EXTINF")) {
      const attrs: Record<string, string> = {};
      let m: RegExpExecArray | null;
      ATTR_RE.lastIndex = 0;
      while ((m = ATTR_RE.exec(line))) attrs[m[1].toLowerCase()] = m[2];
      // Title = text after the last comma that is outside quotes.
      let inQ = false;
      let comma = -1;
      for (let i = 0; i < line.length; i++) {
        if (line[i] === '"') inQ = !inQ;
        else if (line[i] === "," && !inQ) comma = i;
      }
      const title = comma >= 0 ? line.slice(comma + 1).trim() : "";
      pending = {
        name: title || attrs["tvg-name"] || "Unknown",
        logo: attrs["tvg-logo"] || undefined,
        group: attrs["group-title"] || undefined,
      };
    } else if (line.startsWith("#EXTGRP:")) {
      extgrp = line.slice(8).trim();
    } else if (line.startsWith("#")) {
      continue;
    } else {
      const p = pending ?? { name: line.split("/").pop() || line };
      out.push({
        id: `${out.length}-${line}`,
        number: out.length + 1,
        name: p.name,
        url: line,
        logo: p.logo,
        group: p.group || extgrp || "Uncategorized",
      });
      pending = null;
      extgrp = undefined;
    }
  }
  return out;
}

export const ALL_GROUP = "All";

export function groupNames(channels: Channel[]): string[] {
  return [ALL_GROUP, ...new Set(channels.map((c) => c.group))];
}

export function channelsInGroup(channels: Channel[], group: string): Channel[] {
  return group === ALL_GROUP ? channels : channels.filter((c) => c.group === group);
}
