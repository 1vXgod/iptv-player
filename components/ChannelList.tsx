"use client";
import { channelsInGroup } from "@/lib/m3u";
import { useStore } from "@/lib/store";
import { ChannelLogo, Clock, ColorKey, LabelKey, TvIcon } from "./ui";
import { VIDEO_FRAMES } from "./VideoPlayer";

export const ROWS = 10;

export default function ChannelList() {
  const channels = useStore((s) => s.channels);
  const group = useStore((s) => s.group);
  const cursor = useStore((s) => s.cursor);
  const current = useStore((s) => s.current);
  const tech = useStore((s) => s.tech);
  const playState = useStore((s) => s.playState);

  const list = channelsInGroup(channels, group);
  const start = Math.max(0, Math.min(cursor - 3, list.length - ROWS));
  const visible = list.slice(start, start + ROWS);
  const sel = list[cursor];
  const shown = current ?? sel;

  const techLine =
    playState === "error"
      ? "-- / -- / --"
      : [
          tech.width && tech.height ? `${tech.width}x${tech.height}` : "---",
          tech.bitrate ? `${Math.round(tech.bitrate / 1000)}kbps` : "---",
          "HLS",
        ].join(" / ");

  return (
    <div
      className="mx-view-in absolute inset-0 text-white"
      style={{ background: "linear-gradient(180deg,#3a4250 0%,#2e3541 40%,#2b323d 100%)" }}
    >
      {/* preview frame (the live video layer is positioned inside it) */}
      <div
        className="absolute bg-black"
        style={{
          left: `${VIDEO_FRAMES.list.left}%`, top: `${VIDEO_FRAMES.list.top}%`,
          width: `${VIDEO_FRAMES.list.width}%`, height: `${VIDEO_FRAMES.list.height}%`,
          boxShadow: "0 0 0 0.22cqw #c9d6e6",
        }}
      />
      {/* header */}
      <div className="absolute left-[3.2%] top-[4.6%] text-[1.6cqw] font-semibold text-[#5fdcff]">
        Group : {group} ({list.length})
      </div>
      <Clock className="absolute right-[1.4%] top-[4%]" />

      {/* left column: channel rows */}
      <div className="absolute left-[2.6%] top-[8.6%] w-[55%]">
        {/* single highlight bar that glides between rows (GPU transform) */}
        {list.length > 0 && (
          <div
            className="pointer-events-none absolute -left-[1%] right-0 top-0 h-[6.75cqh] py-[0.4cqh]"
            style={{
              transform: `translate3d(0, ${(cursor - start) * 6.75}cqh, 0)`,
              transition: "transform 140ms cubic-bezier(.3,.7,.3,1)",
              willChange: "transform",
            }}
          >
            <div
              className="h-full rounded-l-[0.5cqw]"
              style={{ background: "linear-gradient(90deg,#11b5ec 0%,#16c6f2 70%,#1d9cc4 100%)", boxShadow: "0 0 0.8cqw rgba(30,200,255,.45)" }}
            />
          </div>
        )}
        {visible.map((c, i) => {
          const idx = start + i;
          const active = idx === cursor;
          const playing = current?.id === c.id;
          return (
            <div
              key={c.id}
              onClick={() => {
                const s = useStore.getState();
                useStore.setState({ cursor: idx });
                if (!s.touch) return; // mouse: click selects, double-click plays (below)
                if (s.current?.id === c.id && s.playState !== "error") s.setView("tv");
                else s.play(c);
              }}
              onDoubleClick={() => { useStore.setState({ cursor: idx }); useStore.getState().play(c); }}
              className="relative flex h-[6.75cqh] cursor-pointer items-center border-b border-[#4a5361]"
            >
              <span className="relative w-[9%] pr-[0.6cqw] text-right text-[1.5cqw] font-semibold">{c.number}</span>
              <TvIcon className="relative ml-[0.4cqw] h-[2cqw] w-[2.4cqw] shrink-0" />
              <ChannelLogo src={c.logo} className="relative ml-[0.7cqw] h-[2.2cqw] w-[3cqw] shrink-0" />
              <span className={`relative ml-[0.8cqw] truncate text-[1.55cqw] ${playing && !active ? "text-[#5fdcff]" : ""}`}>
                {c.name}
              </span>
            </div>
          );
        })}
        {!list.length && <div className="p-[2cqw] text-[1.5cqw] text-[#9aa6b6]">No channels in this group</div>}
      </div>

      {/* scrollbar */}
      <div className="absolute left-[58.4%] top-[8.6%] h-[78%] w-[0.25cqw] bg-[#5a6575]">
        {list.length > ROWS && (
          <div
            className="absolute -left-[0.1cqw] h-[1.2%] w-[0.45cqw] bg-[#5fdcff]"
            style={{ top: `${(cursor / Math.max(1, list.length - 1)) * 98}%` }}
          />
        )}
      </div>

      {/* right column: preview + info */}
      {shown && (
        <div className="absolute left-[60.5%] right-[2.2%] top-[8.4%] text-[1.4cqw]">
          <div className="font-semibold">{shown.number}&nbsp;&nbsp;{shown.name}</div>
        </div>
      )}
      <div className="absolute left-[60.5%] right-[2.2%] top-[40.5%] text-[1.4cqw]">
        {sel && (
          <div className="flex items-center gap-[1cqw] font-semibold">
            <ChannelLogo src={sel.logo} className="h-[3cqw] w-[4.6cqw] shrink-0" />
            <span className="truncate">{sel.number}&nbsp;&nbsp;{sel.name}</span>
          </div>
        )}
        <div className="mt-[0.5cqw] text-[1.15cqw]">00:00 - 00:00</div>
        <div className="mt-[0.6cqw] h-[0.45cqw] bg-[#6b7686]" />
        <div className="mt-[0.4cqw] text-[1.15cqw] text-[#5fdcff]">No Info</div>
        <div className="mt-[2.4cqw] text-center text-[1.25cqw]">No Information</div>
        <div className="mt-[2.6cqw] h-[0.12cqw] bg-[#6b7686]" />
        <div className="mt-[0.4cqw] text-[1.1cqw]">00:00</div>
        <div className="mt-[0.2cqw] text-[1.15cqw]">{techLine}</div>
      </div>

      {/* bottom hint bar */}
      <div
        className="absolute bottom-[3.5%] left-[1.6%] right-[1.6%] flex h-[7.4%] items-center justify-around rounded-[0.3cqw] text-[1.25cqw]"
        style={{ background: "linear-gradient(180deg,#8d97a5 0%,#77818f 100%)" }}
      >
        <Hint k={<LabelKey>&lt;</LabelKey>} label="Group" />
        <Hint k={<ColorKey color="red" />} label="Select" />
        <Hint k={<ColorKey color="yellow" />} label="Lock" />
        <Hint k={<LabelKey>FAV</LabelKey>} label="FAV" />
        <Hint k={<LabelKey>EPG</LabelKey>} label="EPG" />
        <Hint k={<LabelKey>i</LabelKey>} label="Info" />
      </div>
    </div>
  );
}

function Hint({ k, label }: { k: React.ReactNode; label: string }) {
  return (
    <span className="flex items-center gap-[0.7cqw]">
      {k}
      <span>{label}</span>
    </span>
  );
}
