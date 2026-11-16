"use client";
import { useEffect, useRef } from "react";
import { useStore } from "@/lib/store";
import { absoluteUrl } from "@/lib/device";

/** Per-attempt time to reach "playing" before trying the next strategy. */
const ATTEMPT_TIMEOUT_MS = 12000;

/**
 * Where the single, persistent video surface sits for each view. The layer is
 * always full-stage and moved with a GPU transform (translate + uniform scale),
 * so view changes animate smoothly without re-layout or video resizes.
 * Values are % of the stage; the 16:9 video is centred in each view's frame
 * (frames are drawn by HomeMenu / ChannelList, letterbox bars come from them).
 */
export const VIDEO_FRAMES = {
  home: { left: 4.6, top: 22.5, width: 46.4, height: 30.5 },
  list: { left: 67.6, top: 14.4, width: 28.3, height: 23.6 },
} as const;

type LayerView = "tv" | "home" | "list" | "manager" | "settings" | "ca" | "pvr" | "files";
/** Screens where the video is hidden (audio keeps playing, like the real box). */
const HIDDEN_VIEWS: LayerView[] = ["settings", "ca", "pvr", "files"];

function layerTransform(view: LayerView) {
  if (view === "tv") return "translate3d(0,0,0) scale(1)";
  const f = VIDEO_FRAMES[view === "manager" ? "list" : HIDDEN_VIEWS.includes(view) ? "home" : (view as "home" | "list")];
  // Stage is 16:9, so a 16:9 rect has equal width/height percentages: fit by the smaller one.
  const s = Math.min(f.width, f.height);
  const left = f.left + (f.width - s) / 2;
  const top = f.top + (f.height - s) / 2;
  return `translate3d(${left}cqw, ${top}cqh, 0) scale(${s / 100})`;
}

type OnFail = (detail: string) => void;
type Cleanup = () => void;
interface Attempt { label: string; run: (onFail: OnFail) => Promise<Cleanup> }

export const proxyUrl = (u: string) => `/api/proxy?url=${encodeURIComponent(u)}`;

/** The single <video> element, for playback controls (seek / pause) on recordings and files. */
export const playerRef: { video: HTMLVideoElement | null } = { video: null };

/** True while we muted the video only because the browser blocked autoplay with sound. */
let autoMuted = false;

function restoreSound() {
  const v = playerRef.video;
  if (!autoMuted || !v) return;
  autoMuted = false;
  v.muted = false;
  useStore.setState({ soundBlocked: false });
}

interface Probe {
  type?: "hls" | "ts" | "unknown";
  status?: number;
  error?: string;
  ffmpeg?: boolean;
  streams?: { pid: number; codec: string; kind: "video" | "audio" | "other" }[] | null;
}

const mse = (t: string) => typeof MediaSource !== "undefined" && MediaSource.isTypeSupported(t);

function videoSupported(c: string) {
  if (c === "h264") return true;
  if (c === "hevc") return mse('video/mp4; codecs="hvc1.1.6.L93.B0"');
  return false; // MPEG-1/2 video: no browser decodes it
}

function audioSupported(c: string) {
  if (c === "aac" || c === "mp3") return true;
  if (c === "ac3") return mse('audio/mp4; codecs="ac-3"');
  if (c === "eac3") return mse('audio/mp4; codecs="ec-3"');
  return false; // MP1/MP2 (DVB "MPEG audio") — browsers only decode Layer III
}

// Remember, per stream URL, which strategy last reached "playing" so re-tuning skips known failures.
const LS_WINNERS = "mirax.strategy";
function loadWinners(): Record<string, string> {
  try { return JSON.parse(localStorage.getItem(LS_WINNERS) || "{}"); } catch { return {}; }
}
function saveWinners(w: Record<string, string>) {
  try { localStorage.setItem(LS_WINNERS, JSON.stringify(w)); } catch { /* ignore */ }
}
function rememberWinner(url: string, label: string) {
  const w = loadWinners();
  if (w[url] !== label) { w[url] = label; saveWinners(w); }
}
function forgetWinner(url: string) {
  const w = loadWinners();
  if (url in w) { delete w[url]; saveWinners(w); }
}
function preferWinner(url: string, attempts: Attempt[]): Attempt[] {
  const label = loadWinners()[url];
  const i = attempts.findIndex((a) => a.label === label);
  return i > 0 ? [attempts[i], ...attempts.slice(0, i), ...attempts.slice(i + 1)] : attempts;
}

function urlPath(u: string) {
  try { return new URL(u).pathname; } catch { return u; }
}

export default function VideoPlayer() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const current = useStore((s) => s.current);
  const tuneNonce = useStore((s) => s.tuneNonce);
  const view = useStore((s) => s.view);
  const playState = useStore((s) => s.playState);
  const errorDetail = useStore((s) => s.errorDetail);
  const setPlayState = useStore((s) => s.setPlayState);
  const setTech = useStore((s) => s.setTech);
  const setNotice = useStore((s) => s.setNotice);
  const notice = useStore((s) => s.notice);
  const soundBlocked = useStore((s) => s.soundBlocked);

  // First key press / click anywhere turns sound back on after an autoplay block.
  useEffect(() => {
    const on = () => restoreSound();
    window.addEventListener("keydown", on, true);
    window.addEventListener("pointerdown", on, true);
    return () => {
      window.removeEventListener("keydown", on, true);
      window.removeEventListener("pointerdown", on, true);
    };
  }, []);

  useEffect(() => {
    const video = videoRef.current;
    playerRef.video = video;
    const tuned = useStore.getState().current;
    if (!video || !tuned) return;
    const key = tuned.url; // stable id for remembered strategies
    const url = tuned.vod ? tuned.url : absoluteUrl(tuned.url);
    const mode = useStore.getState().settings.transcode;
    let cancelled = false;
    let teardown: Cleanup | null = null;
    let timer = 0;
    let idx = -1;
    let lastErr = "";
    let attempts: Attempt[] = [];
    let expectAudio = false; // does this stream carry audio? (enables the audio watchdog)
    let audioWatch = 0;
    const audioFixAlways = useStore.getState().settings.audioFix === "always";

    const tryPlay = () => {
      // Once the user has interacted with the page, sound is allowed again.
      if (autoMuted && navigator.userActivation?.hasBeenActive) restoreSound();
      video.play().catch((err: DOMException) => {
        // Only an autoplay block justifies muting. Other rejections (e.g. "interrupted by a new
        // load request" when zapping quickly) are harmless and must not silence the player.
        if (cancelled || err?.name !== "NotAllowedError") return;
        video.muted = true;
        autoMuted = true;
        useStore.setState({ soundBlocked: true });
        video.play().catch(() => {});
      });
    };

    const resetVideo = () => {
      video.removeAttribute("src");
      video.load();
    };

    const next = (detail?: string) => {
      if (cancelled) return;
      if (detail) lastErr = detail;
      window.clearTimeout(timer);
      window.clearInterval(audioWatch);
      teardown?.();
      teardown = null;
      resetVideo();
      idx++;
      if (idx >= attempts.length) {
        forgetWinner(key);
        setPlayState("error", lastErr || "Stream unavailable");
        return;
      }
      if (idx > 0) setPlayState("loading");
      const my = idx;
      const a = attempts[my];
      const onFail: OnFail = (d) => { if (my === idx) next(d); };
      timer = window.setTimeout(() => {
        if (my === idx && useStore.getState().playState === "loading") onFail(`${a.label}: timed out`);
      }, ATTEMPT_TIMEOUT_MS);
      a.run(onFail)
        .then((c) => { if (cancelled || my !== idx) c(); else teardown = c; })
        .catch((e) => onFail(`${a.label}: ${(e as Error).message}`));
    };

    /**
     * Audio watchdog (Chromium): if the picture keeps moving but no audio is being decoded
     * for ~6 s, the browser's audio path has silently failed — move on to the next method
     * (ending with ffmpeg's audio→AAC conversion, which always yields clean AAC).
     */
    const startAudioWatch = () => {
      window.clearInterval(audioWatch);
      const v = video as HTMLVideoElement & { webkitAudioDecodedByteCount?: number };
      if (!expectAudio || typeof v.webkitAudioDecodedByteCount !== "number") {
        useStore.setState({ audioOk: null });
        return;
      }
      const my = idx;
      let lastBytes = v.webkitAudioDecodedByteCount;
      let lastTime = v.currentTime;
      let stuck = 0;
      audioWatch = window.setInterval(() => {
        if (cancelled || my !== idx) { window.clearInterval(audioWatch); return; }
        const bytes = v.webkitAudioDecodedByteCount ?? 0;
        const moving = !v.paused && v.currentTime > lastTime + 0.5;
        stuck = moving && bytes === lastBytes ? stuck + 1 : moving ? 0 : stuck;
        lastBytes = bytes;
        lastTime = v.currentTime;
        useStore.setState({ audioOk: stuck === 0 });
        if (stuck >= 3) {
          window.clearInterval(audioWatch);
          if (my < attempts.length - 1) next(`${attempts[my].label}: audio stopped decoding`);
          else setNotice("Audio isn't decoding on this channel — try Settings › Audio processing › Always via ffmpeg");
        }
      }, 2000);
    };

    const onPlaying = () => {
      if (cancelled) return;
      window.clearTimeout(timer);
      setPlayState("playing");
      if (attempts[idx]) {
        rememberWinner(key, attempts[idx].label);
        useStore.setState({ method: attempts[idx].label });
      }
      if (video.videoHeight) setTech({ width: video.videoWidth, height: video.videoHeight });
      startAudioWatch();
    };
    const onWaiting = () => {
      if (!cancelled && useStore.getState().playState === "playing") setPlayState("loading");
    };
    video.addEventListener("playing", onPlaying);
    video.addEventListener("waiting", onWaiting);

    /** HLS via hls.js (or native HLS on Safari/iOS). */
    const hlsAttempt = (src: string, label: string): Attempt => ({
      label,
      async run(onFail) {
        const { default: Hls } = await import("hls.js");
        if (Hls.isSupported()) {
          let recovered = false;
          const hls = new Hls({
            enableWorker: true,
            manifestLoadingMaxRetry: 1,
            levelLoadingMaxRetry: 2,
            fragLoadingMaxRetry: 3,
          });
          hls.on(Hls.Events.MANIFEST_PARSED, (_e, data) => {
            const lvl = data.levels[data.levels.length - 1];
            if (lvl) setTech({ videoCodec: lvl.videoCodec, audioCodec: lvl.audioCodec, width: lvl.width, height: lvl.height, bitrate: lvl.bitrate });
            expectAudio = !!lvl?.audioCodec || hls.audioTracks.length > 0;
            tryPlay();
          });
          hls.on(Hls.Events.LEVEL_SWITCHED, (_e, data) => {
            const lvl = hls.levels[data.level];
            if (lvl) setTech({ width: lvl.width, height: lvl.height, bitrate: lvl.bitrate });
          });
          hls.on(Hls.Events.ERROR, (_e, data) => {
            if (!data.fatal) return;
            if (data.type === Hls.ErrorTypes.MEDIA_ERROR && !recovered) {
              recovered = true;
              hls.recoverMediaError();
              return;
            }
            const code = data.response?.code;
            onFail(`${label}: ${data.details}${code ? ` (HTTP ${code})` : ""}`);
          });
          hls.loadSource(src);
          hls.attachMedia(video);
          return () => hls.destroy();
        }
        if (video.canPlayType("application/vnd.apple.mpegurl")) {
          const onErr = () => onFail(`${label}: native HLS playback error`);
          video.addEventListener("error", onErr);
          video.src = src;
          tryPlay();
          return () => video.removeEventListener("error", onErr);
        }
        onFail("HLS is not supported in this browser");
        return () => {};
      },
    });

    /** Raw MPEG-TS (typical Xtream/IPTV panel links) via mpegts.js, always through the proxy. */
    const tsAttempt = (src: string, label: string, onStart?: () => void): Attempt => ({
      label,
      async run(onFail) {
        onStart?.();
        const mpegts = (await import("mpegts.js")).default;
        if (!mpegts.getFeatureList().mseLivePlayback) {
          onFail("MPEG-TS playback is not supported in this browser");
          return () => {};
        }
        const player = mpegts.createPlayer(
          { type: "mpegts", isLive: true, url: new URL(src, window.location.href).href },
          {
            enableWorker: true,
            lazyLoad: false,
            // Latency chasing jumps playback forward when the buffer grows: audible skips. Off.
            liveBufferLatencyChasing: false,
            // Keep MSE buffers bounded so long viewing sessions don't hit QuotaExceeded (audio/video stall).
            autoCleanupSourceBuffer: true,
            autoCleanupMaxBackwardDuration: 60,
            autoCleanupMinBackwardDuration: 30,
            fixAudioTimestampGap: true,
          },
        );
        player.on(mpegts.Events.ERROR, (type: string, detail: string, info?: { msg?: string; code?: number }) => {
          // MSE errors are usually a consequence of the <video> decoder failing; prefer its message.
          const decodeMsg = video.error?.message;
          const extra =
            type === mpegts.ErrorTypes.NETWORK_ERROR && info?.code ? ` (HTTP ${info.code})`
            : decodeMsg ? ` (${decodeMsg})`
            : info?.msg ? ` (${info.msg})` : "";
          onFail(`${label}: ${detail || type}${extra}`);
        });
        const onVideoError = () => onFail(`${label}: decoder error (${video.error?.message || `code ${video.error?.code}`})`);
        video.addEventListener("error", onVideoError);
        player.on(mpegts.Events.MEDIA_INFO, (mi: { videoCodec?: string; audioCodec?: string; width?: number; height?: number }) => {
          setTech({ videoCodec: mi.videoCodec, audioCodec: mi.audioCodec, width: mi.width, height: mi.height });
          if (mi.audioCodec) expectAudio = true;
        });
        player.attachMediaElement(video);
        player.load();
        tryPlay();
        return () => {
          video.removeEventListener("error", onVideoError);
          try { player.pause(); player.unload(); player.detachMediaElement(); player.destroy(); } catch { /* already gone */ }
        };
      },
    });

    /** Recordings / local files the browser can play directly (seekable). */
    const nativeAttempt = (src: string): Attempt => ({
      label: "File",
      async run(onFail) {
        const onErr = () => onFail(`File: ${video.error?.message || "this format can't be played by the browser"}`);
        video.addEventListener("error", onErr);
        video.src = src;
        tryPlay();
        return () => video.removeEventListener("error", onErr);
      },
    });

    if (tuned.vod) {
      const abs = encodeURIComponent(new URL(url, window.location.href).href);
      attempts = tuned.vod === "native"
        ? [nativeAttempt(url), tsAttempt(`/api/transcode?url=${abs}`, "File (audio→AAC)"), tsAttempt(`/api/transcode?url=${abs}&mode=video`, "File (full transcode)")]
        : [tsAttempt(`/api/transcode?url=${abs}`, "File (audio→AAC)"), tsAttempt(`/api/transcode?url=${abs}&mode=video`, "File (full transcode)")];
      next();
    } else (async () => {
      let kind: "hls" | "ts" | "unknown" = /\.m3u8?$/i.test(urlPath(url)) ? "hls" : "unknown";
      let probe: Probe = {};
      {
        try {
          probe = (await (await fetch(`${proxyUrl(url)}&probe=1`)).json()) as Probe;
          if (probe.type) kind = probe.type;
          if (probe.error) lastErr = probe.error;
          else if (probe.status && probe.status >= 400) lastErr = `Provider answered HTTP ${probe.status}`;
        } catch { /* fall through */ }
      }
      if (cancelled) return;
      if (mode === "off") probe.ffmpeg = false;
      const encUrl = encodeURIComponent(url);

      const probedAudio = (probe.streams ?? []).filter((s) => s.kind === "audio");
      if (probedAudio.length) expectAudio = true;
      const audioConvAny = tsAttempt(`/api/transcode?url=${encUrl}`, "MPEG-TS (audio→AAC)");
      const fullConvAny = tsAttempt(`/api/transcode?url=${encUrl}&mode=video`, "MPEG-TS (full transcode)");

      if (mode === "always" && probe.ffmpeg) {
        attempts = [fullConvAny];
      } else if (kind === "hls") {
        const direct = [hlsAttempt(url, "HLS direct"), hlsAttempt(proxyUrl(url), "HLS via proxy")];
        attempts = !probe.ffmpeg ? direct
          : audioFixAlways ? [audioConvAny, ...direct, fullConvAny]
          : [...direct, audioConvAny, fullConvAny];
        attempts = preferWinner(key, attempts);
      } else if (kind === "ts") {
        const streams = probe.streams ?? [];
        const video = streams.find((s) => s.kind === "video");
        const audio = streams.filter((s) => s.kind === "audio");
        setTech({ videoCodec: video?.codec, audioCodec: audio[0]?.codec });

        const enc = encodeURIComponent(url);
        const audioConv = tsAttempt(`/api/transcode?url=${enc}`, "MPEG-TS (audio→AAC)");
        const fullConv = tsAttempt(`/api/transcode?url=${enc}&mode=video`, "MPEG-TS (full transcode)");

        if (video && !videoSupported(video.codec)) {
          if (!probe.ffmpeg) {
            setPlayState("error", `Video codec ${video.codec.toUpperCase()} can't be decoded by this browser. Install ffmpeg to convert it.`);
            return;
          }
          attempts = [fullConv];
        } else {
          const bad = [...new Set(audio.filter((a) => !audioSupported(a.codec)).map((a) => a.codec))];
          const allBad = audio.length > 0 && bad.length === audio.length;
          const stripUrl = `${proxyUrl(url)}&strip=${bad.join(",")}`;
          if (probe.ffmpeg) {
            // Cheapest path first. If audio fails to decode (watchdog) -> audio→AAC; if the video
            // is rejected -> full transcode.
            attempts = allBad || audioFixAlways
              ? [audioConv, fullConv]
              : [tsAttempt(bad.length ? stripUrl : proxyUrl(url), "MPEG-TS"), audioConv, fullConv];
          } else if (allBad) {
            attempts = [tsAttempt(stripUrl, "MPEG-TS (video only)", () =>
              setNotice(`No sound: ${bad.join("/").toUpperCase()} audio isn't supported by browsers. Install ffmpeg to enable it.`))];
          } else {
            attempts = [tsAttempt(bad.length ? stripUrl : proxyUrl(url), "MPEG-TS")];
          }
        }
        attempts = preferWinner(key, attempts);
      } else {
        attempts = [hlsAttempt(proxyUrl(url), "HLS via proxy"), tsAttempt(proxyUrl(url), "MPEG-TS")];
      }
      next();
    })();

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      window.clearInterval(audioWatch);
      video.removeEventListener("playing", onPlaying);
      video.removeEventListener("waiting", onWaiting);
      teardown?.();
      resetVideo();
    };
  }, [tuneNonce, setPlayState, setTech, setNotice]);

  const small = view !== "tv";
  const hidden = HIDDEN_VIEWS.includes(view);
  return (
    <div
      className="absolute inset-0 overflow-hidden bg-black"
      style={{
        transform: layerTransform(view),
        transformOrigin: "0 0",
        transition: "transform 380ms cubic-bezier(.22,.8,.24,1), opacity 200ms ease-out",
        opacity: hidden ? 0 : 1,
        visibility: hidden ? "hidden" : "visible",
        willChange: "transform",
        backfaceVisibility: "hidden",
        zIndex: small ? 20 : 0,
        pointerEvents: small ? "none" : "auto", // let clicks reach the preview frame underneath
      }}
    >
      <video ref={videoRef} className="h-full w-full object-contain" playsInline autoPlay />
      {soundBlocked && !small && playState === "playing" && (
        <div className="mx-fade-in absolute left-1/2 top-[4%] -translate-x-1/2 rounded-[0.5cqw] bg-black/70 px-[1.4cqw] py-[0.6cqw] text-[1.25cqw] text-white">
          🔇 Sound is off — press any key or click to turn it on
        </div>
      )}
      {notice && !small && playState === "playing" && (
        <div className="absolute right-[2%] top-[3%] max-w-[45%] rounded-[0.4cqw] bg-black/65 px-[1cqw] py-[0.5cqw] text-[1.05cqw] text-[#ffe27a]">
          🔇 {notice}
        </div>
      )}
      {current && playState !== "playing" && (
        <SignalOverlay state={playState} small={small} detail={errorDetail} />
      )}
    </div>
  );
}

function SignalOverlay({ state, small, detail }: { state: string; small: boolean; detail: string }) {
  if (state === "error") {
    return (
      <div className="mx-fade-in absolute inset-0 flex flex-col items-center justify-center bg-[radial-gradient(ellipse_at_center,#1b2a44_0%,#05080f_75%)]">
        <div
          className="max-w-[80%] rounded-[0.6cqw] border border-[#3a5a8c] bg-[#0f1a2e]/90 px-[3cqw] py-[1.6cqw] text-center"
          style={{ transform: small ? "scale(1.9)" : undefined }} // the whole layer is scaled down in previews
        >
          <div className="text-[2.6cqw] font-bold tracking-wide text-[#e8eef7]">No Signal</div>
          <div className="mt-[0.6cqw] text-[1.4cqw] text-[#9fb3cf]">This stream is unavailable</div>
          {detail && !small && <div className="mt-[0.6cqw] break-all text-[1.05cqw] text-[#ffb3a8]">{detail}</div>}
          {!small && (
            <div className="mt-[1.2cqw] text-[1.2cqw] text-[#6fd3ff]">
              <Key>OK</Key> retry &nbsp; <Key>▲</Key><Key>▼</Key> next channel
            </div>
          )}
        </div>
      </div>
    );
  }
  return (
    <div className="mx-loading pointer-events-none absolute inset-0 flex items-center justify-center bg-black/40">
      <div style={{ transform: small ? "scale(1.6)" : undefined }}>
        <div className="mx-spinner">
          <div className="mx-spinner-arc" />
        </div>
      </div>
    </div>
  );
}

function Key({ children }: { children: React.ReactNode }) {
  return <span className="mx-[0.15cqw] rounded-[0.3cqw] border border-[#6fd3ff]/60 px-[0.5cqw]">{children}</span>;
}
