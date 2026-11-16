"use client";
import { useEffect, useState } from "react";
import { useStore } from "@/lib/store";

/** Ticking clock; renders nothing until mounted to avoid SSR mismatch. */
export function useNow(): Date | null {
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    setNow(new Date());
    const id = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(id);
  }, []);
  return now;
}

const p2 = (n: number) => String(n).padStart(2, "0");
export const fmtTime = (d: Date, h24 = true) =>
  h24
    ? `${p2(d.getHours())}:${p2(d.getMinutes())}`
    : `${((d.getHours() + 11) % 12) + 1}:${p2(d.getMinutes())} ${d.getHours() < 12 ? "AM" : "PM"}`;
export const fmtIsoDate = (d: Date) => `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`;
export const fmtDmyDate = (d: Date) => `${p2(d.getDate())}/${p2(d.getMonth() + 1)}/${d.getFullYear()}`;

export function Clock({ className = "" }: { className?: string }) {
  const now = useNow();
  const h24 = useStore((s) => s.settings.clock24);
  if (!now) return null;
  return (
    <div className={`text-right leading-none text-white ${className}`}>
      <div className="text-[2.5cqw] font-semibold">{fmtTime(now, h24)}</div>
      <div className="mt-[0.35cqw] text-[1.15cqw] font-semibold">{fmtIsoDate(now)}</div>
    </div>
  );
}

export function TvIcon({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 26" className={className} fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinejoin="round">
      <rect x="2" y="2" width="28" height="17" rx="2.5" />
      <path d="M10 24h12" strokeLinecap="round" />
    </svg>
  );
}

/** Colored remote-control key swatch used in hint bars. */
export function ColorKey({ color }: { color: "red" | "green" | "yellow" | "blue" }) {
  const c = { red: "#e8141c", green: "#1fdc2a", yellow: "#f5dc12", blue: "#36a7ef" }[color];
  return (
    <span
      className="inline-block h-[1.55cqw] w-[2.7cqw] rounded-[0.25cqw] border border-white/60"
      style={{ background: `linear-gradient(180deg, ${c} 0%, ${c} 55%, rgba(0,0,0,.25) 100%)`, backgroundColor: c }}
    />
  );
}

/** Small outlined key label like [FAV] / [EPG] / [<]. */
export function LabelKey({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex h-[1.55cqw] min-w-[2.6cqw] items-center justify-center rounded-[0.25cqw] border border-white/70 bg-gradient-to-b from-[#9aa6b6] to-[#5d6878] px-[0.3cqw] text-[0.85cqw] font-bold leading-none text-white">
      {children}
    </span>
  );
}

/** Speaker icon; crossed out when muted. */
export function SpeakerIcon({ muted, className = "" }: { muted: boolean; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 9h4l5-4v14l-5-4H4z" fill="currentColor" />
      {muted ? (
        <path d="M16.5 9.5l5 5M21.5 9.5l-5 5" />
      ) : (
        <>
          <path d="M16 9a4 4 0 0 1 0 6" />
          <path d="M18.5 6.5a7.5 7.5 0 0 1 0 11" />
        </>
      )}
    </svg>
  );
}

/**
 * Channel logo from the playlist (tvg-logo / portal logo). Tries the image directly, then via the
 * local proxy (some logo hosts block hot-linking), then shows `fallback`.
 */
export function ChannelLogo({ src, className = "", fallback = null }: { src?: string; className?: string; fallback?: React.ReactNode }) {
  const [stage, setStage] = useState(0); // 0 = direct, 1 = via proxy, 2 = give up
  useEffect(() => setStage(0), [src]);
  if (!src || stage >= 2 || !/^(https?:)?\/\//i.test(src)) return <>{fallback}</>;
  const url = stage === 0 ? src : `/api/proxy?url=${encodeURIComponent(src)}`;
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      key={url}
      src={url}
      alt=""
      draggable={false}
      referrerPolicy="no-referrer"
      onError={() => setStage((s) => s + 1)}
      className={`object-contain ${className}`}
    />
  );
}
