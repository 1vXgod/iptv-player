"use client";
import { useEffect, useRef, useState } from "react";
import { useStore } from "@/lib/store";
import { Clock, ColorKey, LabelKey, TvIcon } from "./ui";
import { VIDEO_FRAMES } from "./VideoPlayer";

const ROWS = 10;
const ROW_H = 6.75; // cqh

/**
 * Channel Manager: rearrange the channel order like on the receiver.
 *  OK            pick up / drop the highlighted channel (then ▲▼ moves it)
 *  0-9 + OK      while moving: send it straight to that number
 *  0-9           otherwise: jump the cursor to that number
 *  D / Delete    delete channel      R  reset to playlist order
 *  P             play highlighted    Esc  back to menu
 */
export default function ChannelManager() {
  const channels = useStore((s) => s.channels);
  const current = useStore((s) => s.current);
  const [cursor, setCursor] = useState(() => {
    const s = useStore.getState();
    return s.current ? Math.max(0, s.channels.findIndex((c) => c.id === s.current!.id)) : 0;
  });
  const [moving, setMoving] = useState(false);
  const [digits, setDigits] = useState("");
  const [confirm, setConfirm] = useState<null | "delete" | "reset">(null);
  const [toast, setToast] = useState("");
  const digitTimer = useRef<number | undefined>(undefined);
  const toastTimer = useRef<number | undefined>(undefined);

  const n = channels.length;
  const sel = channels[Math.min(cursor, n - 1)];

  const flash = (msg: string) => {
    setToast(msg);
    window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(""), 1800);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (useStore.getState().overlay) return;
      const s = useStore.getState();
      const k = e.key;
      const handled = (() => {
        if (confirm) {
          if (k === "Enter") {
            if (confirm === "delete" && sel) {
              s.deleteChannel(cursor);
              setCursor((c) => Math.min(c, n - 2));
              flash(`Deleted ${sel.name}`);
            } else if (confirm === "reset") {
              s.resetOrder();
              setCursor(0);
              flash("Restored playlist order");
            }
          }
          setConfirm(null);
          return true;
        }
        if (/^[0-9]$/.test(k)) {
          const next = (digits + k).slice(-4);
          setDigits(next);
          window.clearTimeout(digitTimer.current);
          if (!moving) {
            // jump the cursor after a short pause
            digitTimer.current = window.setTimeout(() => {
              const num = parseInt(next, 10);
              if (num >= 1 && num <= n) setCursor(num - 1);
              setDigits("");
            }, 1100);
          }
          return true;
        }
        switch (k) {
          case "ArrowUp":
          case "ArrowDown": {
            const d = k === "ArrowUp" ? -1 : 1;
            if (moving) {
              const to = cursor + d;
              if (to < 0 || to >= n) return true;
              s.moveChannel(cursor, to);
              setCursor(to);
            } else setCursor((c) => (c + d + n) % n);
            return true;
          }
          case "PageUp":
          case "PageDown": {
            const d = k === "PageUp" ? -ROWS : ROWS;
            const to = Math.max(0, Math.min(n - 1, cursor + d));
            if (moving) s.moveChannel(cursor, to);
            setCursor(to);
            return true;
          }
          case "Enter":
            if (moving && digits) {
              const to = Math.max(1, Math.min(n, parseInt(digits, 10))) - 1;
              s.moveChannel(cursor, to);
              setCursor(to);
              flash(`${sel?.name} → ${to + 1}`);
              setDigits("");
              setMoving(false);
            } else if (moving) {
              setMoving(false);
              flash(`${sel?.name} placed at ${cursor + 1}`);
            } else setMoving(true);
            return true;
          case "Escape":
            if (digits) setDigits("");
            else if (moving) setMoving(false);
            else s.setView("home");
            return true;
          case "Backspace":
            if (digits) setDigits((d) => d.slice(0, -1));
            else if (!moving) s.setView("home");
            return true;
          case "Delete":
          case "d":
          case "D":
            if (!moving && n > 1) setConfirm("delete");
            return true;
          case "r":
          case "R":
            if (!moving) setConfirm("reset");
            return true;
          case "p":
          case "P":
            if (sel) s.play(sel);
            return true;
        }
        return false;
      })();
      if (handled) e.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [cursor, moving, digits, confirm, n, sel]);

  const start = Math.max(0, Math.min(cursor - 3, n - ROWS));
  const visible = channels.slice(start, start + ROWS);

  return (
    <div
      className="mx-view-in absolute inset-0 text-white"
      style={{ background: "linear-gradient(180deg,#3a4250 0%,#2e3541 40%,#2b323d 100%)" }}
    >
      <div
        className="absolute bg-black"
        style={{
          left: `${VIDEO_FRAMES.list.left}%`, top: `${VIDEO_FRAMES.list.top}%`,
          width: `${VIDEO_FRAMES.list.width}%`, height: `${VIDEO_FRAMES.list.height}%`,
          boxShadow: "0 0 0 0.22cqw #c9d6e6",
        }}
      />

      <div className="absolute left-[3.2%] top-[4.6%] text-[1.6cqw] font-semibold text-[#5fdcff]">
        Channel Manager <span className="text-white/70">· All ({n})</span>
      </div>
      <Clock className="absolute right-[1.4%] top-[4%]" />

      {/* rows */}
      <div className="absolute left-[2.6%] top-[8.6%] w-[55%]">
        {n > 0 && (
          <div
            className="pointer-events-none absolute -left-[1%] right-0 top-0 h-[6.75cqh] py-[0.4cqh]"
            style={{
              transform: `translate3d(0, ${(cursor - start) * ROW_H}cqh, 0)`,
              transition: "transform 140ms cubic-bezier(.3,.7,.3,1)",
              willChange: "transform",
            }}
          >
            <div
              className="h-full rounded-l-[0.5cqw]"
              style={{
                background: moving
                  ? "linear-gradient(90deg,#ff9a1f 0%,#ffb340 70%,#d9821a 100%)"
                  : "linear-gradient(90deg,#11b5ec 0%,#16c6f2 70%,#1d9cc4 100%)",
                boxShadow: moving ? "0 0 1cqw rgba(255,170,40,.55)" : "0 0 0.8cqw rgba(30,200,255,.45)",
                transition: "background 150ms, box-shadow 150ms",
              }}
            />
          </div>
        )}
        {visible.map((c, i) => {
          const idx = start + i;
          const active = idx === cursor;
          return (
            <div
              key={c.id}
              onClick={() => setCursor(idx)}
              className="relative flex h-[6.75cqh] cursor-pointer items-center border-b border-[#4a5361]"
            >
              <span className="relative w-[9%] pr-[0.6cqw] text-right text-[1.5cqw] font-semibold">{c.number}</span>
              <TvIcon className="relative ml-[0.4cqw] h-[2cqw] w-[2.4cqw] shrink-0" />
              <span className={`relative ml-[0.8cqw] flex-1 truncate text-[1.55cqw] ${current?.id === c.id && !active ? "text-[#5fdcff]" : ""}`}>
                {c.name}
              </span>
              {active && moving ? (
                <span className="relative mr-[1cqw] text-[1.5cqw] font-bold text-[#3a2200]">⇅</span>
              ) : (
                <span className={`relative mr-[1cqw] max-w-[30%] truncate text-[1.1cqw] ${active ? "text-white/85" : "text-white/45"}`}>
                  {c.group}
                </span>
              )}
            </div>
          );
        })}
      </div>

      {/* scrollbar */}
      <div className="absolute left-[58.4%] top-[8.6%] h-[67.5%] w-[0.25cqw] bg-[#5a6575]">
        {n > ROWS && (
          <div className="absolute -left-[0.1cqw] h-[3%] w-[0.45cqw] bg-[#5fdcff]" style={{ top: `${(cursor / Math.max(1, n - 1)) * 97}%` }} />
        )}
      </div>

      {/* right column */}
      <div className="absolute left-[60.5%] right-[2.2%] top-[40.5%] text-[1.3cqw]">
        {sel && (
          <>
            <div className="text-[1.5cqw] font-semibold">{sel.number}&nbsp;&nbsp;{sel.name}</div>
            <div className="mt-[0.3cqw] text-[1.1cqw] text-white/60">Group: {sel.group}</div>
          </>
        )}
        <div className="mt-[1cqw] h-[0.12cqw] bg-[#6b7686]" />
        <div className="mt-[1cqw] rounded-[0.4cqw] bg-black/20 p-[1cqw] text-[1.1cqw] leading-[1.7] text-white/85">
          {moving ? (
            <>
              <div className="font-semibold text-[#ffb340]">Moving “{sel?.name}”</div>
              <div>▲▼ move one place · PgUp/PgDn ten places</div>
              <div>Type a number + OK to send it there</div>
              <div>OK drops it · Esc stops</div>
            </>
          ) : (
            <>
              <div>OK picks up a channel to move it</div>
              <div>Type a number to jump to it</div>
              <div>Changes are saved automatically</div>
            </>
          )}
        </div>
      </div>

      {/* number entry */}
      {digits && (
        <div className="mx-fade-in absolute right-[3%] top-[11%] z-30 rounded-[0.5cqw] bg-[#1a2333]/95 px-[1.4cqw] py-[0.5cqw] text-[1.3cqw] text-white shadow-lg">
          {moving ? "Move to " : "Go to "}
          <span className="text-[2cqw] font-semibold tracking-[0.2cqw] text-[#5fdcff]">{digits}</span>
          {moving && <span className="text-white/60"> · OK</span>}
        </div>
      )}

      {toast && (
        <div className="mx-fade-in absolute bottom-[13%] left-1/2 z-30 -translate-x-1/2 rounded-[0.5cqw] bg-[#0f1a2e]/95 px-[1.6cqw] py-[0.6cqw] text-[1.25cqw] text-white shadow-lg">
          {toast}
        </div>
      )}

      {confirm && (
        <div className="mx-fade-in absolute inset-0 z-40 flex items-center justify-center bg-black/50">
          <div className="w-[38%] rounded-[0.8cqw] border border-[#5d7fd6] p-[2cqw] text-center" style={{ background: "linear-gradient(180deg,#2a50e8 0%,#1d38b8 100%)" }}>
            <div className="text-[1.8cqw] font-semibold">{confirm === "delete" ? "Delete channel?" : "Reset channel order?"}</div>
            <div className="mt-[0.8cqw] text-[1.25cqw] text-white/85">
              {confirm === "delete" ? `“${sel?.name}” will be removed from the list. Reset order brings it back.` : "All moves and deletions for this playlist will be undone."}
            </div>
            <div className="mt-[1.4cqw] text-[1.15cqw] text-[#bfe6ff]">OK confirm · any other key cancels</div>
          </div>
        </div>
      )}

      {/* bottom hint bar */}
      <div
        className="absolute bottom-[3.5%] left-[1.6%] right-[1.6%] flex h-[7.4%] items-center justify-around rounded-[0.3cqw] text-[1.2cqw]"
        style={{ background: "linear-gradient(180deg,#8d97a5 0%,#77818f 100%)" }}
      >
        <Hint k={<LabelKey>OK</LabelKey>} label={moving ? "Drop" : "Move"} />
        <Hint k={<LabelKey>0-9</LabelKey>} label={moving ? "Move to No." : "Go to No."} />
        <Hint k={<ColorKey color="red" />} label="Delete (D)" />
        <Hint k={<ColorKey color="green" />} label="Play (P)" />
        <Hint k={<ColorKey color="yellow" />} label="Reset (R)" />
        <Hint k={<LabelKey>Esc</LabelKey>} label="Back" />
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
