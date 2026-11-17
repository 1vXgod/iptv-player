"use client";
import { useEffect, useState } from "react";
import { playlistDisplayName, useStore } from "@/lib/store";
import { deviceMac } from "@/lib/device";
import { fmtDate, useSubscription } from "@/lib/subscription";
import { Backdrop } from "./HomeMenu";
import { Clock, LabelKey } from "./ui";

export default function CAScreen() {
  const source = useStore((s) => s.playlistSource);
  const channels = useStore((s) => s.channels);
  const { load, creds, portal, refresh } = useSubscription();
  const [mac, setMac] = useState("");
  useEffect(() => setMac(deviceMac()), []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (useStore.getState().overlay) return;
      if (e.key === "Escape" || e.key === "Backspace" || e.key === "Enter") {
        e.preventDefault();
        useStore.getState().setView("home");
      } else if (e.key === "r" || e.key === "R") refresh();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const rows: [string, React.ReactNode][] = [
    ["Playlist", playlistDisplayName(source)],
    ["Channels", String(channels.length)],
  ];
  if (portal) {
    rows.push(["MAC address", <span key="m" className="font-mono text-[#ffe27a]">{portal.mac}</span>], ["Portal", portal.host]);
  } else if (creds) {
    rows.push(["Server", new URL(creds.base).host], ["Username", creds.username]);
  }
  if (!portal && mac) rows.push(["Device MAC", <span key="dm" className="font-mono text-white/80">{mac}</span>]);

  let expiry: React.ReactNode = null;
  if (load.state === "ok") {
    const a = load.acc;
    const exp = a.exp_date ? Number(a.exp_date) : null;
    const daysLeft = exp ? Math.ceil((exp * 1000 - Date.now()) / 86_400_000) : null;
    const active = (a.status || "").toLowerCase() === "active";
    rows.push(["Status", <span key="s" className={active ? "text-[#7dff86]" : "text-[#ff9b9b]"}>{a.status || "Unknown"}</span>]);
    if (a.max_connections !== undefined) rows.push(["Connections", `${a.active_cons ?? 0} active of ${a.max_connections} allowed`]);
    if (a.created_at) rows.push(["Created", fmtDate(Number(a.created_at))]);
    if (a.is_trial !== undefined) rows.push(["Trial", Number(a.is_trial) ? "Yes" : "No"]);
    expiry = exp ? (
      <>
        <div className="text-[1.3cqw] uppercase tracking-[0.15em] text-[#3a2a00]/70">Expires</div>
        <div className="mt-[0.4cqw] text-[2.6cqw] font-bold leading-none text-[#2a1f00]">{fmtDate(exp)}</div>
        <div className={`mt-[0.8cqw] text-[1.5cqw] font-semibold ${daysLeft! <= 7 ? "text-[#b3121a]" : "text-[#2a1f00]/80"}`}>
          {daysLeft! > 0 ? `${daysLeft} day${daysLeft === 1 ? "" : "s"} left` : "Expired"}
        </div>
      </>
    ) : (
      <>
        <div className="text-[1.3cqw] uppercase tracking-[0.15em] text-[#3a2a00]/70">Expires</div>
        <div className="mt-[0.4cqw] text-[2.6cqw] font-bold leading-none text-[#2a1f00]">Unlimited</div>
      </>
    );
  }

  return (
    <div className="mx-view-in absolute inset-0 overflow-hidden text-white">
      <Backdrop />
      <Clock className="absolute right-[4.6%] top-[7.2%]" />
      <div className="absolute left-[4.6%] top-[7.5%] text-[2.6cqw] font-semibold drop-shadow-[0_0.15cqw_0.3cqw_rgba(0,0,40,.4)]">
        CA · Subscription
      </div>

      <div
        className="absolute left-[4.6%] right-[4.6%] top-[20%] bottom-[13%] flex gap-[2cqw] rounded-[1cqw] p-[2cqw]"
        style={{ background: "linear-gradient(180deg, rgba(14,28,110,.55), rgba(10,20,90,.65))", boxShadow: "inset 0 0 0 0.12cqw rgba(160,200,255,.25), 0 1cqw 3cqw rgba(0,0,50,.35)" }}
      >
        {/* card */}
        <div
          className="relative flex w-[36%] shrink-0 flex-col justify-between overflow-hidden rounded-[1.2cqw] p-[2cqw]"
          style={{ background: "linear-gradient(150deg,#fde46a 0%,#f6c514 55%,#e2a800 100%)", boxShadow: "0 1cqw 2.4cqw rgba(0,0,40,.4), inset 0 0.15cqw 0 rgba(255,255,255,.6)" }}
        >
          <div className="pointer-events-none absolute -right-[20%] -top-[30%] h-[80%] w-[80%] rounded-full bg-white/25" />
          <div className="relative flex items-start justify-between">
            <div className="max-w-[70%] truncate text-[1.6cqw] font-bold text-[#2a1f00]">{playlistDisplayName(source)}</div>
            <svg viewBox="0 0 22 17" className="h-[2.8cqw] w-[3.6cqw]">
              <rect x="0.5" y="0.5" width="21" height="16" rx="3" fill="#ffe9a0" stroke="#a87c00" />
              <path d="M0.5 6H8M0.5 11H8M14 6H21.5M14 11H21.5M8 0.5V16.5M14 0.5V16.5" stroke="#a87c00" strokeWidth="0.8" />
            </svg>
          </div>
          <div className="relative">
            {load.state === "ok" ? expiry
              : load.state === "loading" ? <div className="text-[1.5cqw] text-[#2a1f00]/80">Checking subscription…</div>
              : load.state === "none" ? <div className="text-[1.3cqw] leading-[1.5] text-[#2a1f00]/85">Expiry is shown for Xtream logins and MAC portals. Plain M3U files have no subscription info.</div>
              : <div className="text-[1.3cqw] leading-[1.5] text-[#7a1010]">Couldn&apos;t read subscription: {load.msg}</div>}
          </div>
          <div className="relative flex h-[2.4cqw] items-end gap-[0.18cqw]">
            {Array.from({ length: 34 }).map((_, i) => (
              <span key={i} className="h-full bg-[#2a1f00]/75" style={{ width: i % 4 === 0 ? "0.32cqw" : i % 3 === 0 ? "0.22cqw" : "0.12cqw" }} />
            ))}
          </div>
        </div>

        {/* details */}
        <div className="flex-1">
          <div className="text-[1.6cqw] font-semibold text-[#9fe4ff]">Account details</div>
          <div className="mt-[1cqw]">
            {rows.map(([k, v]) => (
              <div key={k} className="flex border-b border-white/12 py-[0.8cqw] text-[1.35cqw]">
                <span className="w-[32%] text-white/65">{k}</span>
                <span className="flex-1 truncate">{v}</span>
              </div>
            ))}
          </div>
          {load.state === "ok" && load.acc.message ? (
            <div className="mt-[1.2cqw] rounded-[0.5cqw] bg-white/8 p-[1cqw] text-[1.15cqw] text-white/80">{load.acc.message}</div>
          ) : null}
        </div>
      </div>

      <div className="absolute bottom-[4.5%] left-[4.6%] right-[4.6%] flex items-center justify-center gap-[3cqw] text-[1.2cqw] text-white/90">
        <span className="flex items-center gap-[0.6cqw]"><LabelKey>R</LabelKey> Refresh</span>
        <span className="flex items-center gap-[0.6cqw]"><LabelKey>Esc</LabelKey> Back</span>
      </div>
    </div>
  );
}
