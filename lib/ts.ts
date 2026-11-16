/**
 * Minimal MPEG-TS helpers (server side): codec probing and stripping audio
 * tracks that browsers can't decode (e.g. MPEG-1 Layer II "MP2", common on
 * DVB-sourced IPTV channels).
 */
const PKT = 188;

export type Codec =
  | "h264" | "hevc" | "mpeg2video" | "mpeg1video"
  | "aac" | "mp1" | "mp2" | "mp3" | "mpeg-audio" | "ac3" | "eac3"
  | "subtitle" | "other";

export interface EsInfo { pid: number; streamType: number; codec: Codec; kind: "video" | "audio" | "other" }

function codecOf(st: number, desc: Uint8Array): EsInfo["codec"] {
  switch (st) {
    case 0x1b: return "h264";
    case 0x24: return "hevc";
    case 0x02: return "mpeg2video";
    case 0x01: return "mpeg1video";
    case 0x0f: case 0x11: return "aac";
    case 0x03: case 0x04: return "mpeg-audio"; // layer refined later from frame header
    case 0x81: return "ac3";
    case 0x87: return "eac3";
    case 0x06:
      for (let k = 0; k + 1 < desc.length; k += 2 + desc[k + 1]) {
        if (desc[k] === 0x6a) return "ac3";
        if (desc[k] === 0x7a) return "eac3";
        if (desc[k] === 0x59 || desc[k] === 0x56) return "subtitle";
      }
      return "other";
    default: return "other";
  }
}
const kindOf = (c: Codec): EsInfo["kind"] =>
  ["h264", "hevc", "mpeg2video", "mpeg1video"].includes(c) ? "video"
  : ["aac", "mp1", "mp2", "mp3", "mpeg-audio", "ac3", "eac3"].includes(c) ? "audio" : "other";

export function findSync(buf: Uint8Array, from = 0): number {
  for (let i = from; i + 2 * PKT < buf.length; i++) {
    if (buf[i] === 0x47 && buf[i + PKT] === 0x47 && buf[i + 2 * PKT] === 0x47) return i;
  }
  return -1;
}

/** Offset of the section/PES payload within a packet starting at p, or -1. */
function payloadStart(buf: Uint8Array, p: number): number {
  const afc = (buf[p + 3] >> 4) & 3;
  if (!(afc & 1)) return -1;
  let i = p + 4;
  if (afc & 2) i += 1 + buf[i];
  return i < p + PKT ? i : -1;
}

function parsePmtSection(buf: Uint8Array, i: number, end: number): EsInfo[] | null {
  if (buf[i] !== 0x02) return null;
  const secLen = ((buf[i + 1] & 0x0f) << 8) | buf[i + 2];
  if (i + 3 + secLen > end) return null; // spans packets
  const piLen = ((buf[i + 10] & 0x0f) << 8) | buf[i + 11];
  const out: EsInfo[] = [];
  for (let j = i + 12 + piLen; j < i + 3 + secLen - 4; ) {
    const st = buf[j];
    const pid = ((buf[j + 1] & 0x1f) << 8) | buf[j + 2];
    const esLen = ((buf[j + 3] & 0x0f) << 8) | buf[j + 4];
    const codec = codecOf(st, buf.subarray(j + 5, j + 5 + esLen));
    out.push({ pid, streamType: st, codec, kind: kindOf(codec) });
    j += 5 + esLen;
  }
  return out;
}

/** Find the elementary streams of the first program, refining MPEG audio layer. */
export function probeTs(buf: Uint8Array): EsInfo[] | null {
  const off = findSync(buf);
  if (off < 0) return null;
  let pmtPid = -1;
  let streams: EsInfo[] | null = null;
  for (let p = off; p + PKT <= buf.length; p += PKT) {
    if (buf[p] !== 0x47) continue;
    const pid = ((buf[p + 1] & 0x1f) << 8) | buf[p + 2];
    const pusi = buf[p + 1] & 0x40;
    if (!pusi) continue;
    let i = payloadStart(buf, p);
    if (i < 0) continue;
    if (pid === 0 && pmtPid < 0) {
      i += 1 + buf[i];
      const secLen = ((buf[i + 1] & 0x0f) << 8) | buf[i + 2];
      for (let j = i + 8; j < i + 3 + secLen - 4; j += 4) {
        if (((buf[j] << 8) | buf[j + 1]) !== 0) { pmtPid = ((buf[j + 2] & 0x1f) << 8) | buf[j + 3]; break; }
      }
    } else if (pid === pmtPid && !streams) {
      i += 1 + buf[i];
      streams = parsePmtSection(buf, i, p + PKT);
    } else if (streams) {
      // Refine MPEG audio layer from the first frame header of that PID.
      const es = streams.find((s) => s.pid === pid && s.codec === "mpeg-audio");
      if (es && buf[i] === 0 && buf[i + 1] === 0 && buf[i + 2] === 1) {
        const k0 = i + 9 + buf[i + 8];
        for (let k = k0; k + 1 < p + PKT; k++) {
          if (buf[k] === 0xff && (buf[k + 1] & 0xe0) === 0xe0) {
            const layer = (buf[k + 1] >> 1) & 3;
            es.codec = layer === 1 ? "mp3" : layer === 2 ? "mp2" : layer === 3 ? "mp1" : es.codec;
            break;
          }
        }
      }
      if (!streams.some((s) => s.codec === "mpeg-audio")) return streams;
    }
  }
  return streams;
}

// --- CRC32/MPEG-2 for rewritten PMT sections ---
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i << 24;
    for (let k = 0; k < 8; k++) c = c & 0x80000000 ? (c << 1) ^ 0x04c11db7 : c << 1;
    t[i] = c >>> 0;
  }
  return t;
})();
function crc32mpeg(b: Uint8Array): number {
  let c = 0xffffffff;
  for (const x of b) c = ((c << 8) ^ CRC_TABLE[((c >>> 24) ^ x) & 0xff]) >>> 0;
  return c >>> 0;
}

/**
 * TransformStream that removes elementary streams whose codec matches `drop`
 * (both their packets and their PMT entries), leaving a valid TS.
 */
export function stripStreams(drop: (c: Codec) => boolean): TransformStream<Uint8Array, Uint8Array> {
  let rest = new Uint8Array(0);
  let synced = false;
  let pmtPid = -1;
  const dropped = new Set<number>();

  const rewritePmt = (pkt: Uint8Array) => {
    const p = 0;
    let i = payloadStart(pkt, p);
    if (i < 0 || !(pkt[1] & 0x40)) return pkt;
    i += 1 + pkt[i];
    if (pkt[i] !== 0x02) return pkt;
    const secLen = ((pkt[i + 1] & 0x0f) << 8) | pkt[i + 2];
    if (i + 3 + secLen > PKT) return pkt; // multi-packet PMT: leave as-is
    const piLen = ((pkt[i + 10] & 0x0f) << 8) | pkt[i + 11];
    const head = pkt.slice(i, i + 12 + piLen);
    const kept: Uint8Array[] = [];
    for (let j = i + 12 + piLen; j < i + 3 + secLen - 4; ) {
      const st = pkt[j];
      const pid = ((pkt[j + 1] & 0x1f) << 8) | pkt[j + 2];
      const esLen = ((pkt[j + 3] & 0x0f) << 8) | pkt[j + 4];
      const entry = pkt.slice(j, j + 5 + esLen);
      let codec = codecOf(st, entry.subarray(5));
      if (codec === "mpeg-audio") codec = "mp2"; // DVB MPEG audio is Layer II in practice
      if (drop(codec)) dropped.add(pid);
      else kept.push(entry);
      j += 5 + esLen;
    }
    const bodyLen = head.length + kept.reduce((n, e) => n + e.length, 0);
    const sec = new Uint8Array(bodyLen + 4);
    sec.set(head, 0);
    let o = head.length;
    for (const e of kept) { sec.set(e, o); o += e.length; }
    const newLen = bodyLen + 4 - 3;
    sec[1] = (sec[1] & 0xf0) | ((newLen >> 8) & 0x0f);
    sec[2] = newLen & 0xff;
    const crc = crc32mpeg(sec.subarray(0, bodyLen));
    sec[bodyLen] = crc >>> 24; sec[bodyLen + 1] = (crc >>> 16) & 0xff;
    sec[bodyLen + 2] = (crc >>> 8) & 0xff; sec[bodyLen + 3] = crc & 0xff;
    const out = new Uint8Array(PKT).fill(0xff);
    out.set(pkt.subarray(0, i), 0);
    out.set(sec, i);
    return out;
  };

  return new TransformStream({
    transform(chunk, ctl) {
      let buf = new Uint8Array(rest.length + chunk.length);
      buf.set(rest, 0);
      buf.set(chunk, rest.length);
      let p = 0;
      if (!synced) {
        p = findSync(buf);
        if (p < 0) { rest = buf.slice(Math.max(0, buf.length - 3 * PKT)); return; }
        synced = true;
      }
      const out: Uint8Array[] = [];
      for (; p + PKT <= buf.length; p += PKT) {
        if (buf[p] !== 0x47) {
          const s = findSync(buf, p);
          if (s < 0) break;
          p = s;
          if (p + PKT > buf.length) break;
        }
        const pkt = buf.subarray(p, p + PKT);
        const pid = ((pkt[1] & 0x1f) << 8) | pkt[2];
        if (pid === 0 && pmtPid < 0 && pkt[1] & 0x40) {
          let i = payloadStart(pkt, 0);
          if (i >= 0) {
            i += 1 + pkt[i];
            const secLen = ((pkt[i + 1] & 0x0f) << 8) | pkt[i + 2];
            for (let j = i + 8; j < i + 3 + secLen - 4; j += 4) {
              if (((pkt[j] << 8) | pkt[j + 1]) !== 0) { pmtPid = ((pkt[j + 2] & 0x1f) << 8) | pkt[j + 3]; break; }
            }
          }
        }
        if (dropped.has(pid)) continue;
        out.push(pid === pmtPid ? rewritePmt(pkt) : pkt.slice());
      }
      rest = buf.slice(p);
      buf = new Uint8Array(0);
      if (out.length) {
        const merged = new Uint8Array(out.length * PKT);
        out.forEach((o, k) => merged.set(o, k * PKT));
        ctl.enqueue(merged);
      }
    },
  });
}
