"use client";
import { useEffect } from "react";
import { codecTags, useStore } from "@/lib/store";
import { ColorKey, LabelKey, TvIcon, fmtDmyDate, fmtTime, useNow } from "./ui";


export default function InfoBar() {
  const visible = useStore((s) => s.infoVisible);
  const nonce = useStore((s) => s.infoNonce);
  const current = useStore((s) => s.current);
  const tech = useStore((s) => s.tech);
  const playState = useStore((s) => s.playState);
  const now = useNow();
  const { infoTimeout, clock24 } = useStore((s) => s.settings);

  useEffect(() => {
    if (!visible) return;
    const id = window.setTimeout(() => useStore.getState().showInfo(false), infoTimeout * 1000);
    return () => window.clearTimeout(id);
  }, [visible, nonce, infoTimeout]);

  if (!current) return null;
  const tags = playState === "error" ? [] : codecTags(tech);
  const status = playState === "playing" ? "Live" : playState === "loading" ? "Tuning…" : "No signal";

  return (
    <div
      className={`absolute inset-x-0 bottom-0 z-30 h-[29%] text-[#d9ecff] transition-[translate,opacity] duration-300 ease-out will-change-[translate,opacity] ${
        visible ? "translate-y-0 opacity-100" : "pointer-events-none translate-y-[20%] opacity-0"
      }`}
      style={{ background: "linear-gradient(180deg,rgba(32,41,54,.92) 0%,rgba(24,31,42,.96) 100%)", borderTop: "0.15cqw solid #3e4b5e" }}
    >
      {/* left block: icon, number, codec tags */}
      <div className="absolute left-[2.6%] top-[12%] w-[18%]">
        <div className="flex items-center gap-[3cqw]">
          <TvIcon className="h-[4.6cqw] w-[5.4cqw] text-[#bfe6ff]" />
          <span className="text-[3.2cqw] font-medium leading-none">{current.number}</span>
        </div>
        <div className="mt-[1.5cqw] flex gap-[0.4cqw]">
          {tags.map((t) => (
            <span key={t} className="rounded-[0.3cqw] border border-[#8fd0ff] bg-[#22566f] px-[0.4cqw] text-[0.85cqw] font-bold italic leading-[1.5cqw] text-[#bfe6ff]">
              {t}
            </span>
          ))}
        </div>
      </div>

      {/* channel name above now/next */}
      <div className="absolute left-[23.6%] top-[-14%] max-w-[50%] truncate text-[2.2cqw] font-semibold text-white drop-shadow-[0_0.15cqw_0.2cqw_rgba(0,0,0,.9)]">
        {current.name}
      </div>

      {/* now / next */}
      <div className="absolute left-[23.6%] right-[23%] top-[6%] text-[1.5cqw]">
        <div>00:00 - 00:00&nbsp;&nbsp;&nbsp;No info</div>
        <div className="mt-[0.6cqw] h-[0.4cqw] rounded-full bg-[#5f6b7c]">
          <div className={`h-full rounded-full bg-[#9fd8ff] ${playState === "playing" ? "w-full" : "w-0"} transition-all duration-700`} />
        </div>
        <div className="mt-[0.9cqw]">00:00 - 00:00&nbsp;&nbsp;&nbsp;No info</div>
      </div>

      {/* right block: date/time + stream status */}
      <div className="absolute right-[2.4%] top-[6%] w-[19%] text-[1.5cqw]">
        <div className="text-right">{now ? `${fmtDmyDate(now)}  ${fmtTime(now, clock24)}` : ""}</div>
        <div className="mt-[0.9cqw] flex items-center justify-between text-[1.15cqw]">
          <span>Stream</span>
          <span className={playState === "error" ? "text-[#ff8b8b]" : playState === "playing" ? "text-[#7dff86]" : "text-[#ffe27a]"}>
            {status}
          </span>
        </div>
        <div className="mt-[0.3cqw] flex items-center justify-between text-[1.15cqw]">
          <span>Video</span>
          <span>{tech.height ? `${tech.width}x${tech.height}` : "---"}</span>
        </div>
      </div>

      {/* hint row */}
      <div className="absolute left-[23.6%] right-[2.4%] top-[50%] border-t-[0.12cqw] border-[#4c596b] pt-[1cqw]">
        <div className="flex items-center justify-between text-[1.35cqw]">
          <span className="flex items-center gap-[0.8cqw]"><ColorKey color="red" /> Audio</span>
          <span className="flex items-center gap-[0.8cqw]"><ColorKey color="green" /> Timer</span>
          <span className="flex items-center gap-[0.8cqw]"><ColorKey color="blue" /> Timeshift</span>
          <span className="flex items-center gap-[0.8cqw]"><LabelKey>EPG</LabelKey> EPG</span>
        </div>
      </div>
    </div>
  );
}
