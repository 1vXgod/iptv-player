/**
 * Stream hub (server side): ONE upstream connection per live MPEG-TS channel, shared by every
 * consumer on this machine — live viewing, recordings, ffmpeg conversion and probing.
 *
 * Why: many IPTV panels allow a single connection per channel per account; a second connection
 * kicks the first. Without sharing, recording a channel and watching it at the same time made
 * the two connections knock each other off.
 *
 * The hub reconnects upstream on drops, keeps the last few MB so late joiners start instantly,
 * and closes the upstream a few seconds after the last consumer leaves.
 *
 * Keyframe gate: a live viewer who joins mid-GOP hands the decoder frames whose reference pictures it never saw.
 * A PC decoder quietly drops them; phone hardware decoders draw green blocks / lines until the next keyframe (and some
 * streams throw "mmco"/"missing reference" errors for much longer). So every new viewer gets the stream's PAT/PMT
 * first and then data that STARTS ON A KEYFRAME (H.264). This also gives recordings and ffmpeg a clean start.
 */
import { findSync } from "./ts";

const UA = process.env.IPTV_USER_AGENT || "VLC/3.0.20 LibVLC/3.0.20";
const PKT = 188;
const RING_BYTES = 3 * 1024 * 1024; // recent data replayed to late joiners (PAT/PMT + a keyframe)
const LINGER_MS = 4000; // keep upstream open briefly after the last consumer (fast re-tune / probe -> play)
const MAX_RETRIES = 8;
const NOT_TS_LIMIT = 512 * 1024; // give up if no TS sync is found in this much data
const GATE_TIMEOUT_MS = 3000; // streams that never signal a keyframe: start anyway after this long

export class HubError extends Error {
  constructor(msg: string, readonly notTs = false) { super(msg); }
}

interface Sub { push: (b: Uint8Array) => boolean; close: (err?: Error) => void }

class Hub {
  readonly subs = new Set<Sub>();
  private ring: Uint8Array[] = [];
  private ringBytes = 0;
  private ctrl: AbortController | null = null;
  private lingerTimer: NodeJS.Timeout | null = null;
  private dataWaiters: (() => void)[] = [];
  // keyframe gate state
  private pat: Uint8Array | null = null;
  private pmt: Uint8Array | null = null;
  private pmtPid = -1;
  private videoPid = -1;
  private gate: "unknown" | "h264" | "none" = "unknown"; // none = not H.264 (or no video): no gating
  private waiting = new Map<Sub, NodeJS.Timeout>(); // viewers waiting for their first keyframe
  closed = false;
  bytesIn = 0;
  status = 0;
  error: HubError | null = null;

  constructor(readonly url: string) {}

  start() {
    void this.loop();
    this.armLinger(); // a hub opened only for probing closes by itself if the player never joins
  }

  private armLinger() {
    if (this.subs.size === 0 && !this.lingerTimer && !this.closed) {
      this.lingerTimer = setTimeout(() => { this.lingerTimer = null; if (this.subs.size === 0) this.shutdown(); }, LINGER_MS);
    }
  }

  private async loop() {
    let failures = 0;
    while (!this.closed) {
      this.ctrl = new AbortController();
      try {
        const r = await fetch(this.url, {
          headers: { "User-Agent": UA, Accept: "*/*" },
          redirect: "follow",
          signal: this.ctrl.signal,
          cache: "no-store",
        });
        this.status = r.status;
        if (!r.ok || !r.body) {
          // Our own resolvers (e.g. /api/stalker/play) answer JSON {error}; surface that message.
          let msg = `Provider answered HTTP ${r.status}`;
          try { const j = JSON.parse(await r.text()); if (j?.error) msg = String(j.error); } catch { /* not JSON */ }
          throw new HubError(msg);
        }
        let pending = new Uint8Array(0);
        let synced = false;
        let scanned = 0;
        for await (const chunk of r.body as unknown as AsyncIterable<Uint8Array>) {
          if (this.closed) break;
          const buf = new Uint8Array(pending.length + chunk.length);
          buf.set(pending, 0);
          buf.set(chunk, pending.length);
          let start = 0;
          if (!synced || buf[0] !== 0x47) {
            start = findSync(buf);
            if (start < 0) {
              scanned += chunk.length;
              if (scanned > NOT_TS_LIMIT) throw new HubError("Not an MPEG-TS stream", true);
              pending = buf.slice(Math.max(0, buf.length - 3 * PKT));
              continue;
            }
            synced = true;
          }
          const whole = Math.floor((buf.length - start) / PKT) * PKT;
          if (whole > 0) {
            failures = 0;
            this.broadcast(buf.slice(start, start + whole));
          }
          pending = buf.slice(start + whole);
        }
        if (this.closed) break;
        throw new HubError("Provider closed the stream");
      } catch (e) {
        if (this.closed) break;
        const err = e instanceof HubError ? e : new HubError((e as Error).message);
        this.error = err;
        failures++;
        if (err.notTs || failures > MAX_RETRIES) { this.shutdown(err); break; }
        await new Promise((res) => setTimeout(res, Math.min(5000, 400 * failures)));
      }
    }
  }

  private broadcast(b: Uint8Array) {
    this.bytesIn += b.length;
    this.ring.push(b);
    this.ringBytes += b.length;
    while (this.ringBytes > RING_BYTES && this.ring.length > 1) this.ringBytes -= this.ring.shift()!.length;
    this.trackTables(b);
    // where (if anywhere) in this chunk may waiting viewers start?
    let openAt = -1;
    if (this.waiting.size) openAt = this.gate === "none" ? 0 : this.gate === "h264" ? this.findKeyframe(b, 0) : -1;
    for (const s of this.subs) {
      if (this.waiting.has(s)) {
        if (openAt >= 0) this.open(s, b.subarray(openAt));
        continue;
      }
      if (!s.push(b)) this.drop(s);
    }
    const w = this.dataWaiters.splice(0);
    w.forEach((f) => f());
  }

  subscribe(s: Sub): () => void {
    if (this.lingerTimer) { clearTimeout(this.lingerTimer); this.lingerTimer = null; }
    this.subs.add(s);
    if (this.gate === "none") {
      for (const b of this.ring) if (!s.push(b)) { this.drop(s); break; }
    } else {
      // start on the most recent keyframe in the buffer, if it holds one...
      if (this.gate === "h264") {
        const all = Buffer.concat(this.ring);
        const k = this.lastKeyframe(all);
        if (k >= 0) { this.sendHeaders(s) && s.push(all.subarray(k)) || this.drop(s); return () => this.drop(s); }
      }
      // ...otherwise wait for the next one (with a fallback so odd streams still start)
      this.waiting.set(s, setTimeout(() => {
        if (!this.waiting.has(s)) return;
        this.waiting.delete(s);
        if (this.sendHeaders(s)) for (const b of this.ring) if (!s.push(b)) { this.drop(s); break; }
      }, GATE_TIMEOUT_MS));
    }
    return () => this.drop(s);
  }

  private open(s: Sub, data: Uint8Array) {
    const t = this.waiting.get(s);
    if (t) clearTimeout(t);
    this.waiting.delete(s);
    if (!(this.sendHeaders(s) && s.push(data))) this.drop(s);
  }

  /** PAT + PMT first, so the decoder knows the streams before the first picture arrives. */
  private sendHeaders(s: Sub): boolean {
    if (this.pat && !s.push(this.pat)) return false;
    if (this.pmt && !s.push(this.pmt)) return false;
    return true;
  }

  /** Remember the latest PAT / PMT packets and which PID carries the (H.264) video. */
  private trackTables(b: Uint8Array) {
    for (let o = 0; o + PKT <= b.length; o += PKT) {
      const pid = ((b[o + 1] & 0x1f) << 8) | b[o + 2];
      if (!(b[o + 1] & 0x40)) continue; // payload_unit_start only
      if (pid === 0) {
        this.pat = b.slice(o, o + PKT);
        const i0 = this.payloadStart(b, o);
        if (i0 < 0) continue;
        const i = i0 + 1 + b[i0];
        const secLen = ((b[i + 1] & 0x0f) << 8) | b[i + 2];
        for (let j = i + 8; j < i + 3 + secLen - 4 && j + 3 < o + PKT; j += 4) {
          if (((b[j] << 8) | b[j + 1]) !== 0) { this.pmtPid = ((b[j + 2] & 0x1f) << 8) | b[j + 3]; break; }
        }
      } else if (pid === this.pmtPid) {
        this.pmt = b.slice(o, o + PKT);
        const i0 = this.payloadStart(b, o);
        if (i0 < 0) continue;
        const i = i0 + 1 + b[i0];
        if (b[i] !== 0x02) continue;
        const secLen = ((b[i + 1] & 0x0f) << 8) | b[i + 2];
        const piLen = ((b[i + 10] & 0x0f) << 8) | b[i + 11];
        let video = -1, type = 0;
        for (let j = i + 12 + piLen; j + 4 < i + 3 + secLen - 4 && j + 4 < o + PKT; ) {
          const st = b[j];
          if ((st === 0x1b || st === 0x24 || st === 0x02 || st === 0x01) && video < 0) { video = ((b[j + 1] & 0x1f) << 8) | b[j + 2]; type = st; }
          j += 5 + (((b[j + 3] & 0x0f) << 8) | b[j + 4]);
        }
        this.videoPid = video;
        this.gate = type === 0x1b ? "h264" : "none";
      }
    }
  }

  private payloadStart(b: Uint8Array, o: number): number {
    const afc = (b[o + 3] >> 4) & 3;
    if (!(afc & 1)) return -1;
    let i = o + 4;
    if (afc & 2) i += 1 + b[o + 4];
    return i < o + PKT ? i : -1;
  }

  /** Is the TS packet at b[o..] the start of an H.264 keyframe (random-access flag, IDR or SPS)? */
  private isKeyframe(b: Uint8Array, o: number): boolean {
    if (this.videoPid < 0) return false;
    if ((((b[o + 1] & 0x1f) << 8) | b[o + 2]) !== this.videoPid) return false;
    const afc = (b[o + 3] >> 4) & 3;
    if (!(b[o + 1] & 0x40)) return false; // keyframes start a new PES
    if ((afc & 2) && b[o + 4] > 0 && (b[o + 5] & 0x40)) return true; // random_access_indicator
    let i = this.payloadStart(b, o);
    if (i < 0 || b[i] !== 0 || b[i + 1] !== 0 || b[i + 2] !== 1) return false;
    i += 9 + b[i + 8]; // skip the PES header
    for (; i + 4 < o + PKT; i++) {
      if (b[i] === 0 && b[i + 1] === 0 && (b[i + 2] === 1 || (b[i + 2] === 0 && b[i + 3] === 1))) {
        const nal = b[b[i + 2] === 1 ? i + 3 : i + 4] & 0x1f;
        if (nal === 5 || nal === 7) return true; // IDR slice / SPS
      }
    }
    return false;
  }

  private findKeyframe(b: Uint8Array, from: number): number {
    for (let o = from; o + PKT <= b.length; o += PKT) if (this.isKeyframe(b, o)) return o;
    return -1;
  }

  private lastKeyframe(b: Uint8Array): number {
    for (let o = b.length - PKT; o >= 0; o -= PKT) if (this.isKeyframe(b, o)) return o;
    return -1;
  }

  private drop(s: Sub) {
    const t = this.waiting.get(s);
    if (t) { clearTimeout(t); this.waiting.delete(s); }
    if (!this.subs.delete(s)) return;
    s.close();
    this.armLinger();
  }

  shutdown(err?: HubError) {
    if (this.closed) return;
    this.closed = true;
    if (err) this.error = err;
    if (this.lingerTimer) { clearTimeout(this.lingerTimer); this.lingerTimer = null; }
    this.ctrl?.abort();
    for (const t of this.waiting.values()) clearTimeout(t);
    this.waiting.clear();
    for (const s of [...this.subs]) s.close(err);
    this.subs.clear();
    this.dataWaiters.splice(0).forEach((f) => f());
    if (hubs.get(this.url) === this) hubs.delete(this.url);
  }

  get bufferedBytes() { return this.ringBytes; }

  /** Recent bytes (for probing without opening another connection). Waits briefly if empty. */
  async snapshot(minBytes: number, timeoutMs: number): Promise<Uint8Array> {
    const deadline = Date.now() + timeoutMs;
    while (this.ringBytes < minBytes && !this.closed && Date.now() < deadline) {
      await new Promise<void>((res) => {
        this.dataWaiters.push(res);
        setTimeout(res, Math.max(0, deadline - Date.now()));
      });
    }
    return Buffer.concat(this.ring);
  }
}

const G = globalThis as unknown as { __mxHubs?: Map<string, Hub> };
const hubs: Map<string, Hub> = (G.__mxHubs ??= new Map());

function hubFor(url: string): Hub {
  let h = hubs.get(url);
  if (!h || h.closed) {
    // Starting a different channel: close channels nobody is using any more right away (instead of
    // after the linger delay). Accounts limited to one connection (typical for MAG devices) would
    // otherwise refuse the new channel while the old one is still open.
    for (const other of hubs.values()) if (other.subs.size === 0) other.shutdown();
    h = new Hub(url);
    hubs.set(url, h);
    h.start();
  }
  return h;
}

/**
 * Probe a live stream through the hub, so the probe and the following playback share one
 * provider connection. Returns null if the stream isn't raw MPEG-TS (caller probes directly).
 */
export async function probeViaHub(url: string): Promise<{ buf: Uint8Array; status: number; error?: string } | null> {
  const h = hubFor(url);
  // Hold the hub open while we wait (the panel may take a few seconds to release the previous
  // channel's connection); when we let go, the linger delay keeps it for the player to join.
  const release = h.subscribe({ push: () => true, close: () => {} });
  let buf: Uint8Array;
  try { buf = await h.snapshot(300_000, 18_000); } finally { release(); }
  if (buf.length) return { buf, status: h.status || 200 };
  if (h.error?.notTs) return null;
  return { buf, status: h.status || 502, error: h.error?.message || "No data received from the stream" };
}

/** An already-running hub for this URL (someone is watching/recording it), if any. */
export function activeHub(url: string): Hub | null {
  const h = hubs.get(url);
  return h && !h.closed ? h : null;
}

/** Subscribe as a web ReadableStream (for HTTP responses). */
export function liveStream(url: string, signal?: AbortSignal): ReadableStream<Uint8Array> {
  const hub = hubFor(url);
  let unsub = () => {};
  return new ReadableStream<Uint8Array>({
    start(ctl) {
      unsub = hub.subscribe({
        push: (b) => {
          try {
            ctl.enqueue(b);
            return (ctl.desiredSize ?? 0) > -64 * 1024 * 1024; // drop clients that stopped reading
          } catch { return false; }
        },
        close: (err) => { try { if (err) ctl.error(err); else ctl.close(); } catch { /* already closed */ } },
      });
      signal?.addEventListener("abort", () => unsub());
    },
    cancel() { unsub(); },
  });
}

/** Subscribe with callbacks (for feeding ffmpeg's stdin). Returns an unsubscribe function. */
export function liveSubscribe(url: string, onData: (b: Uint8Array) => void, onEnd: (err?: Error) => void): () => void {
  return hubFor(url).subscribe({ push: (b) => { onData(b); return true; }, close: onEnd });
}

/** Should this URL go through the hub? Raw live streams only — not HLS playlists/segments. */
export function isLiveTsUrl(url: string): boolean {
  try {
    const p = new URL(url).pathname.toLowerCase();
    return !/\.(m3u8?|mp4|m4s|aac|vtt|key|jpg|jpeg|png|gif|webp|svg)$/.test(p);
  } catch { return false; }
}
