"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRecordings } from "@/lib/pvr-client";
import ChannelsPanel from "./ChannelsPanel";
import { Icon, type IconName } from "./icons";
import MobilePlayer, { type RecCtx } from "./MobilePlayer";
import NowPlaying from "./NowPlaying";
import PlaylistTab from "./PlaylistTab";
import RecordingsTab from "./RecordingsTab";
import SettingsTab from "./SettingsTab";
import { Sheet } from "./ui";
import { ROTATED_FRAME, setBrowserFullscreen, useMedia, useWakeLock } from "./utils";

type Tab = "channels" | "recordings" | "playlist" | "settings";
const TABS: { id: Tab; label: string; icon: IconName }[] = [
  { id: "channels", label: "Channels", icon: "tv" },
  { id: "recordings", label: "Recordings", icon: "rec" },
  { id: "playlist", label: "Playlist", icon: "list" },
  { id: "settings", label: "Settings", icon: "gear" },
];

/**
 * The phone interface: picture on top (swipe / drag / tap gestures), what's playing under it,
 * then Channels · Recordings · Playlist · Settings. Turn the phone sideways — or tap Rotate — for a full-screen player.
 */
export default function MobileApp() {
  const [tab, setTab] = useState<Tab>("channels");
  const [manualFs, setManualFs] = useState(false);
  const [rotated, setRotated] = useState(false); // software rotation (browser wouldn't turn the display)
  const [sheet, setSheet] = useState(false);
  const [toast, setToast] = useState("");
  const toastTimer = useRef<number | undefined>(undefined);

  // sideways on a phone = full-screen player; the buttons also force it when held upright
  const landscapeShort = useMedia("(orientation: landscape) and (max-height: 520px)");
  const full = landscapeShort || manualFs;
  const rotatedActive = rotated && full && !landscapeShort;
  useWakeLock(true);

  const { recs, ffmpeg, refresh } = useRecordings(true);
  const say = useCallback((m: string) => {
    setToast(m);
    window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(""), 2600);
  }, []);
  const rec = useMemo<RecCtx>(() => ({ recs, refresh, say }), [recs, refresh, say]);

  // leaving fullscreen with the system gesture / back button must update our state
  useEffect(() => {
    const on = () => { if (!document.fullscreenElement) { setManualFs(false); setRotated(false); } };
    document.addEventListener("fullscreenchange", on);
    return () => document.removeEventListener("fullscreenchange", on);
  }, []);
  useEffect(() => { if (!full) setSheet(false); }, [full]);
  // the phone really was turned sideways: the real orientation takes over from the software rotation
  useEffect(() => { if (landscapeShort) setRotated(false); }, [landscapeShort]);

  const toggleFull = useCallback(() => {
    const next = !manualFs;
    setManualFs(next);
    if (!next) setRotated(false);
    void setBrowserFullscreen(next);
  }, [manualFs]);

  /**
   * Rotate button. First ask the browser properly (fullscreen + landscape lock: works on Android Chrome). If the phone
   * is still upright a moment later (iPhone, or the lock was refused) turn the picture sideways inside the app instead.
   */
  const rotate = useCallback(async () => {
    setManualFs(true);
    await setBrowserFullscreen(true); // must start inside the tap, before any other await
    await new Promise((r) => setTimeout(r, 400));
    if (!window.matchMedia("(orientation: landscape)").matches) setRotated(true);
  }, []);

  // anything `fixed` inside a rotated frame is positioned relative to it, so drawers and toasts turn with the picture
  const frameStyle = rotatedActive ? { ...ROTATED_FRAME, zIndex: 60, pointerEvents: "none" as const } : undefined;

  return (
    <div className="fixed inset-0 flex flex-col bg-[#060a14] font-receiver text-white" style={{ paddingTop: full ? 0 : "env(safe-area-inset-top)" }}>
      <MobilePlayer
        full={full}
        rotated={rotatedActive}
        canExit={manualFs || !landscapeShort}
        canRotate={!landscapeShort && !rotatedActive}
        onToggleFull={toggleFull}
        onRotate={() => void rotate()}
        onOpenChannels={() => setSheet(true)}
        rec={rec}
      />

      <div className={full ? "hidden" : "flex min-h-0 flex-1 flex-col"}>
        <NowPlaying rec={rec} onToggleFull={toggleFull} onRotate={() => void rotate()} ffmpeg={ffmpeg} />

        <main className="min-h-0 flex-1 overflow-hidden">
          <div className={tab === "channels" ? "h-full" : "hidden"}><ChannelsPanel onAdd={() => setTab("playlist")} /></div>
          <div className={tab === "recordings" ? "h-full" : "hidden"}><RecordingsTab rec={rec} ffmpeg={ffmpeg} /></div>
          <div className={tab === "playlist" ? "h-full" : "hidden"}><PlaylistTab onLoaded={() => setTab("channels")} /></div>
          <div className={tab === "settings" ? "h-full" : "hidden"}><SettingsTab say={say} /></div>
        </main>

        <nav
          className="flex shrink-0 border-t border-white/10 bg-[#0a1020]"
          style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
          aria-label="Sections"
        >
          {TABS.map((t) => {
            const on = tab === t.id;
            return (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                aria-current={on ? "page" : undefined}
                className={`flex h-14 min-w-0 flex-1 flex-col items-center justify-center gap-0.5 text-[11px] font-medium transition-colors active:bg-white/5 ${on ? "text-[#16c6f2]" : "text-white/50"}`}
              >
                <Icon name={t.icon} className="h-6 w-6" />
                {t.label}
              </button>
            );
          })}
        </nav>
      </div>

      {/* drawer + toast: inside a rotated frame when the picture is turned, so they turn with it.
          (The frame is always the same element, so opening the drawer never re-mounts anything.) */}
      <div style={frameStyle}>
        <Sheet open={sheet && full} onClose={() => setSheet(false)} side="right" title="Channels">
          <div className="h-full"><ChannelsPanel onPick={() => setSheet(false)} /></div>
        </Sheet>

        {toast && (
          <div
            className="mx-fade-in pointer-events-none fixed inset-x-4 z-[70] mx-auto max-w-sm rounded-xl bg-[#1b2542] px-4 py-3 text-center text-sm font-medium shadow-2xl"
            style={{ bottom: full ? "20px" : "calc(72px + env(safe-area-inset-bottom))" }}
          >
            {toast}
          </div>
        )}
      </div>
    </div>
  );
}
