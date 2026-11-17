"use client";
import { useEffect, useState } from "react";
import { clearAllLocalData, playlistDisplayName, Settings, useStore } from "@/lib/store";
import { Backdrop } from "./HomeMenu";
import { Clock, LabelKey } from "./ui";

type Item =
  | { kind: "choice"; label: string; key: keyof Settings; options: { value: Settings[keyof Settings]; label: string }[]; hint: string }
  | { kind: "action"; label: string; id: "playlist" | "strategies" | "order" | "factory"; hint: string; danger?: boolean };

const ITEMS: Item[] = [
  {
    kind: "choice", label: "Info bar duration", key: "infoTimeout",
    options: [3, 5, 8, 10, 15].map((v) => ({ value: v, label: `${v} s` })),
    hint: "How long the channel info bar stays on screen after zapping.",
  },
  {
    kind: "choice", label: "Clock format", key: "clock24",
    options: [{ value: true, label: "24 hour" }, { value: false, label: "12 hour" }],
    hint: "Time format used on the menu, channel list and info bar.",
  },
  {
    kind: "choice", label: "Start screen", key: "startView",
    options: [{ value: "tv", label: "Last channel" }, { value: "home", label: "Main menu" }],
    hint: "What the player opens with.",
  },
  {
    kind: "choice", label: "Stream conversion", key: "transcode",
    options: [
      { value: "auto", label: "Automatic" },
      { value: "always", label: "Always convert" },
      { value: "off", label: "Off" },
    ],
    hint: "Automatic uses ffmpeg only when the browser can't play a channel. Always converts every channel to 720p (more CPU). Off never uses ffmpeg.",
  },
  {
    kind: "choice", label: "Audio processing", key: "audioFix",
    options: [
      { value: "auto", label: "Automatic" },
      { value: "always", label: "Always via ffmpeg" },
    ],
    hint: "Automatic plays audio directly and switches to ffmpeg only if it stops decoding. 'Always via ffmpeg' converts every channel's audio to clean AAC (video untouched, little CPU) — use it if sound drops out or crackles.",
  },
  {
    kind: "choice", label: "Interface", key: "ui",
    options: [
      { value: "auto", label: "Auto-detect" },
      { value: "phone", label: "Phone layout" },
      { value: "tv", label: "TV layout" },
    ],
    hint: "Auto shows the phone layout on phones and tablets and this TV layout on a computer. Choose one to force it (you can also add ?ui=phone or ?ui=tv to the address).",
  },
  { kind: "action", label: "Playlist", id: "playlist", hint: "Load a playlist from a URL, a local file, or the built-in sample." },
  { kind: "action", label: "Forget learned stream methods", id: "strategies", hint: "The player remembers which method worked for each channel. Clear it if channels behave oddly." },
  { kind: "action", label: "Reset channel order", id: "order", hint: "Undo all Channel Manager moves and deletions for the current playlist." },
  { kind: "action", label: "Factory reset", id: "factory", danger: true, hint: "Remove the saved playlist, channel order, settings and everything else stored by this player." },
];

export default function SettingsScreen() {
  const settings = useStore((s) => s.settings);
  const source = useStore((s) => s.playlistSource);
  const count = useStore((s) => s.channels.length);
  const [cursor, setCursor] = useState(0);
  const [armed, setArmed] = useState<string | null>(null); // destructive actions need a second OK
  const [toast, setToast] = useState("");

  const flash = (m: string) => {
    setToast(m);
    window.setTimeout(() => setToast(""), 1800);
  };

  const cycle = (item: Item, d: number) => {
    if (item.kind !== "choice") return;
    const i = item.options.findIndex((o) => o.value === settings[item.key]);
    const next = item.options[(i + d + item.options.length) % item.options.length];
    useStore.getState().updateSettings({ [item.key]: next.value } as Partial<Settings>);
  };

  const run = (item: Item) => {
    if (item.kind === "choice") return cycle(item, 1);
    const s = useStore.getState();
    if ((item.id === "order" || item.id === "factory" || item.id === "strategies") && armed !== item.id) {
      setArmed(item.id);
      return;
    }
    setArmed(null);
    if (item.id === "playlist") s.openOverlay("loader");
    else if (item.id === "strategies") {
      try { localStorage.removeItem("mirax.strategy"); } catch { /* ignore */ }
      flash("Learned stream methods cleared");
    } else if (item.id === "order") {
      s.resetOrder();
      flash("Channel order restored");
    } else if (item.id === "factory") {
      clearAllLocalData();
      window.location.reload();
    }
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (useStore.getState().overlay) return;
      const item = ITEMS[cursor];
      let handled = true;
      if (e.key === "ArrowUp") { setCursor((c) => (c - 1 + ITEMS.length) % ITEMS.length); setArmed(null); }
      else if (e.key === "ArrowDown") { setCursor((c) => (c + 1) % ITEMS.length); setArmed(null); }
      else if (e.key === "ArrowLeft") cycle(item, -1);
      else if (e.key === "ArrowRight") cycle(item, 1);
      else if (e.key === "Enter") run(item);
      else if (e.key === "Escape" || e.key === "Backspace") {
        if (armed) setArmed(null);
        else useStore.getState().setView("home");
      } else handled = false;
      if (handled) e.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const cur = ITEMS[cursor];
  return (
    <div className="mx-view-in absolute inset-0 overflow-hidden text-white">
      <Backdrop />
      <Clock className="absolute right-[4.6%] top-[7.2%]" />
      <div className="absolute left-[4.6%] top-[7.5%] flex items-center gap-[1.2cqw]">
        <span className="text-[2.6cqw] font-semibold drop-shadow-[0_0.15cqw_0.3cqw_rgba(0,0,40,.4)]">Settings</span>
      </div>

      <div
        className="absolute left-[4.6%] right-[4.6%] top-[20%] bottom-[13%] overflow-hidden rounded-[1cqw]"
        style={{ background: "linear-gradient(180deg, rgba(14,28,110,.55), rgba(10,20,90,.65))", boxShadow: "inset 0 0 0 0.12cqw rgba(160,200,255,.25), 0 1cqw 3cqw rgba(0,0,50,.35)" }}
      >
        {/* item list */}
        <div className="absolute bottom-[4%] left-[2%] top-[4%] w-[58%]">
          {ITEMS.map((it, i) => {
            const active = i === cursor;
            const value = it.kind === "choice" ? it.options.find((o) => o.value === settings[it.key])?.label : undefined;
            return (
              <div
                key={it.label}
                onClick={() => { setCursor(i); run(it); }}
                className="relative flex h-[10%] cursor-pointer items-center rounded-[0.6cqw] px-[1.4cqw]"
                style={{
                  background: active ? "linear-gradient(90deg,#11b5ec 0%,#16c6f2 75%,rgba(22,198,242,.6) 100%)" : "transparent",
                  boxShadow: active ? "0 0 1cqw rgba(30,200,255,.45)" : "none",
                  transition: "background 120ms",
                }}
              >
                <span className={`flex-1 text-[1.5cqw] ${it.kind === "action" && it.danger && !active ? "text-[#ffb3b3]" : ""}`}>{it.label}</span>
                {value !== undefined ? (
                  <span className="flex items-center gap-[0.8cqw] text-[1.4cqw] font-semibold">
                    <span className={active ? "opacity-100" : "opacity-0"}>◀</span>
                    <span className="min-w-[11cqw] text-center">{value}</span>
                    <span className={active ? "opacity-100" : "opacity-0"}>▶</span>
                  </span>
                ) : (
                  <span className="text-[1.3cqw] text-white/80">{armed === (it.kind === "action" && it.id) ? "Press OK again to confirm" : "›"}</span>
                )}
              </div>
            );
          })}
        </div>

        {/* description panel */}
        <div className="absolute bottom-[4%] right-[2%] top-[4%] w-[36%] rounded-[0.8cqw] bg-white/8 p-[1.6cqw]">
          <div className="text-[1.6cqw] font-semibold text-[#9fe4ff]">{cur.label}</div>
          <div className="mt-[1cqw] text-[1.25cqw] leading-[1.6] text-white/85">{cur.hint}</div>
          <div className="absolute bottom-[1.6cqw] left-[1.6cqw] right-[1.6cqw] border-t border-white/15 pt-[1cqw] text-[1.1cqw] leading-[1.7] text-white/70">
            <div>Playlist: <span className="text-white">{playlistDisplayName(source)}</span></div>
            <div>Channels: <span className="text-white">{count}</span></div>
          </div>
        </div>
      </div>

      {toast && (
        <div className="mx-fade-in absolute bottom-[15%] left-1/2 z-30 -translate-x-1/2 rounded-[0.5cqw] bg-[#0f1a2e]/95 px-[1.6cqw] py-[0.6cqw] text-[1.25cqw] shadow-lg">
          {toast}
        </div>
      )}

      <div className="absolute bottom-[4.5%] left-[4.6%] right-[4.6%] flex items-center justify-center gap-[3cqw] text-[1.2cqw] text-white/90">
        <span className="flex items-center gap-[0.6cqw]"><LabelKey>▲▼</LabelKey> Select</span>
        <span className="flex items-center gap-[0.6cqw]"><LabelKey>◀▶</LabelKey> Change</span>
        <span className="flex items-center gap-[0.6cqw]"><LabelKey>OK</LabelKey> Open</span>
        <span className="flex items-center gap-[0.6cqw]"><LabelKey>Esc</LabelKey> Back</span>
      </div>
    </div>
  );
}
