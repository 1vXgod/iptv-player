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
 */
import { findSync } from "./ts";

const UA = process.env.IPTV_USER_AGENT || "VLC/3.0.20 LibVLC/3.0.20";
const PKT = 188;
const RING_BYTES = 3 * 1024 * 1024; // recent data replayed to late joiners (PAT/PMT + a keyframe)
const LINGER_MS = 4000; // keep upstream open briefly after the last consumer (fast re-tune / probe -> play)
const MAX_RETRIES = 8;
const NOT_TS_LIMIT = 512 * 1024; // give up if no TS sync is found in this much data

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
    for (const s of this.subs) if (!s.push(b)) this.drop(s);
    const w = this.dataWaiters.splice(0);
    w.forEach((f) => f());
  }

  subscribe(s: Sub): () => void {
    if (this.lingerTimer) { clearTimeout(this.lingerTimer); this.lingerTimer = null; }
    this.subs.add(s);
    for (const b of this.ring) if (!s.push(b)) { this.drop(s); break; }
    return () => this.drop(s);
  }

  private drop(s: Sub) {
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
