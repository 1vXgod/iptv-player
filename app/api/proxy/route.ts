/**
 * Local stream proxy.
 *
 * Browsers can only fetch HLS playlists/segments from servers that send CORS
 * headers — most IPTV providers don't. This route fetches upstream on the
 * server side, adds CORS, and rewrites every URL inside .m3u8 manifests so
 * that sub-playlists, segments and keys also go through the proxy.
 *
 *   GET /api/proxy?url=<encoded>            -> proxied content
 *   GET /api/proxy?url=<encoded>&probe=1    -> {"type":"hls"|"ts"|"unknown", ...}
 */
import { findFfmpeg } from "@/lib/ffmpeg";
import { EsInfo, findSync, probeTs, stripStreams } from "@/lib/ts";
import { activeHub, isLiveTsUrl, liveStream, probeViaHub } from "@/lib/stream-hub";

const PROBE_BYTES = 600_000;

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Many IPTV panels only accept players they recognise; VLC's UA is widely allowed.
const UPSTREAM_UA = process.env.IPTV_USER_AGENT || "VLC/3.0.20 LibVLC/3.0.20";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Range",
  "Access-Control-Expose-Headers": "Content-Length, Content-Range",
};

const proxied = (u: string) => `/api/proxy?url=${encodeURIComponent(u)}`;

function rewriteManifest(text: string, base: string): string {
  return text
    .split(/\r?\n/)
    .map((line) => {
      const t = line.trim();
      if (!t) return line;
      if (t.startsWith("#")) {
        return line.replace(/URI="([^"]+)"/g, (_, u: string) => `URI="${proxied(new URL(u, base).href)}"`);
      }
      return proxied(new URL(t, base).href);
    })
    .join("\n");
}

function looksLikeManifest(url: string, contentType: string) {
  return /mpegurl/i.test(contentType) || /\.m3u8?($|\?)/i.test(new URL(url).pathname);
}

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS });
}

export async function GET(req: Request) {
  const params = new URL(req.url).searchParams;
  const target = params.get("url");
  if (!target || !/^https?:\/\//i.test(target)) {
    return Response.json({ error: "Missing or invalid url" }, { status: 400, headers: CORS });
  }

  // Channel already open (being watched or recorded): probe from the shared hub's buffer
  // instead of opening a second provider connection, which would kick the first one.
  const hub = activeHub(target);
  if (params.get("probe") && hub) {
    const buf = await hub.snapshot(400_000, 5000);
    const ok = findSync(buf) >= 0;
    return Response.json(
      { type: ok ? "ts" : "unknown", status: hub.status || 200, streams: ok ? probeTs(buf) : null, ffmpeg: !!findFfmpeg(), shared: true },
      { headers: CORS },
    );
  }

  // Probe of a live stream: go through the hub so the player's next request reuses this connection.
  if (params.get("probe") && isLiveTsUrl(target)) {
    const res = await probeViaHub(target);
    if (res) {
      const ok = findSync(res.buf) >= 0;
      return Response.json(
        { type: ok ? "ts" : "unknown", status: res.status, streams: ok ? probeTs(res.buf) : null, ffmpeg: !!findFfmpeg(), error: res.error, shared: true },
        { headers: CORS },
      );
    }
    // not raw TS (e.g. an HLS playlist without .m3u8 in the URL): fall through to a direct probe
  }

  // Live MPEG-TS for the player: served from the shared hub (one provider connection per channel).
  if (params.get("live") && isLiveTsUrl(target)) {
    const strip = params.get("strip");
    let body = liveStream(target, req.signal);
    if (strip) {
      const bad = new Set(strip.split(","));
      body = body.pipeThrough(stripStreams((c) => bad.has(c)));
    }
    return new Response(body, { headers: { ...CORS, "Content-Type": "video/mp2t", "Cache-Control": "no-store" } });
  }

  const headers: Record<string, string> = { "User-Agent": UPSTREAM_UA, Accept: "*/*" };
  const range = req.headers.get("range");
  if (range) headers.Range = range;

  let upstream: Response;
  try {
    upstream = await fetch(target, { headers, redirect: "follow", signal: req.signal, cache: "no-store" });
  } catch (e) {
    return Response.json({ error: `Upstream unreachable: ${(e as Error).message}` }, { status: 502, headers: CORS });
  }

  const ct = upstream.headers.get("content-type") || "";
  const finalUrl = upstream.url || target; // after redirects (Xtream panels redirect to tokenised URLs)

  // Probe: sniff the start of the stream to decide HLS vs raw MPEG-TS, and read TS codecs.
  if (params.get("probe")) {
    let type: "hls" | "ts" | "unknown" = "unknown";
    let streams: EsInfo[] | null = null;
    if (upstream.ok && upstream.body) {
      const reader = upstream.body.getReader();
      const chunks: Uint8Array[] = [];
      let n = 0;
      const deadline = Date.now() + 5000;
      try {
        while (n < PROBE_BYTES && Date.now() < deadline) {
          const { value, done } = await reader.read();
          if (done || !value) break;
          chunks.push(value);
          n += value.length;
          if (n >= 512 && chunks.length === 1) {
            const head = Buffer.from(value.subarray(0, 512)).toString("utf8").replace(/^\uFEFF/, "").trimStart();
            if (head.startsWith("#EXTM3U")) { type = "hls"; break; }
          }
        }
      } catch { /* use what we have */ } finally {
        reader.cancel().catch(() => {});
      }
      const buf = Buffer.concat(chunks);
      if (type !== "hls") {
        if (buf.toString("utf8", 0, 512).replace(/^\uFEFF/, "").trimStart().startsWith("#EXTM3U")) type = "hls";
        else if (findSync(buf) >= 0) { type = "ts"; streams = probeTs(buf); }
        else if (/mpegurl/i.test(ct)) type = "hls";
        else if (/mp2t|octet-stream|video/i.test(ct)) type = "ts";
      }
    }
    return Response.json(
      { type, status: upstream.status, contentType: ct, streams, ffmpeg: !!findFfmpeg() },
      { headers: CORS },
    );
  }

  if (!upstream.ok && upstream.status !== 206) {
    return new Response(`Upstream HTTP ${upstream.status}`, { status: upstream.status, headers: CORS });
  }

  if (looksLikeManifest(finalUrl, ct)) {
    const text = await upstream.text();
    if (text.trimStart().startsWith("#EXTM3U")) {
      return new Response(rewriteManifest(text, finalUrl), {
        headers: { ...CORS, "Content-Type": "application/vnd.apple.mpegurl", "Cache-Control": "no-store" },
      });
    }
    return new Response(text, { headers: { ...CORS, "Content-Type": ct || "application/octet-stream" } });
  }

  // Raw TS with audio the browser can't decode: drop those tracks (video-only fallback).
  const strip = params.get("strip");
  if (strip && upstream.body) {
    const bad = new Set(strip.split(","));
    return new Response(upstream.body.pipeThrough(stripStreams((c) => bad.has(c))), {
      headers: { ...CORS, "Content-Type": "video/mp2t", "Cache-Control": "no-store" },
    });
  }

  // Segments, keys, raw TS live streams: stream straight through.
  const out: Record<string, string> = { ...CORS, "Cache-Control": "no-store" };
  for (const h of ["content-type", "content-length", "content-range", "accept-ranges"]) {
    const v = upstream.headers.get(h);
    if (v) out[h] = v;
  }
  return new Response(upstream.body, { status: upstream.status, headers: out });
}
