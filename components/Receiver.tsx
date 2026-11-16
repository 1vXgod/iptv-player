"use client";
import { useEffect, useRef, useState } from "react";
import { useStore, type View } from "@/lib/store";
import ChannelList, { ROWS } from "./ChannelList";
import HomeMenu, { TILES, TILE_NAV, TileId } from "./HomeMenu";
import InfoBar from "./InfoBar";
import PlaylistLoader, { Placeholder } from "./PlaylistLoader";
import VideoPlayer from "./VideoPlayer";
import ChannelManager from "./ChannelManager";
import SettingsScreen from "./SettingsScreen";
import CAScreen from "./CAScreen";
import PvrScreen from "./PvrScreen";
import FileListScreen from "./FileListScreen";
import { RecBadge, StatsPanel, VodBar, vodKey } from "./Playback";

/** The whole "box": a 16:9 stage that scales to the window, plus remote-style key handling. */
export default function Receiver() {
  const view = useStore((s) => s.view);
  const overlay = useStore((s) => s.overlay);
  const placeholderTitle = useStore((s) => s.placeholderTitle);
  const isVod = useStore((s) => !!s.current?.vod);
  const [tile, setTile] = useState<TileId>("channels");
  const [digits, setDigits] = useState("");
  const digitTimer = useRef<number | undefined>(undefined);

  useEffect(() => {
    useStore.getState().hydrate();
    // Deep links: /#home, #list, #manager, #settings, #ca, #pvr, #files open that screen directly.
    const h = window.location.hash.slice(1);
    if (["home", "list", "manager", "settings", "ca", "pvr", "files"].includes(h)) useStore.getState().setView(h as View);
  }, []);

  const selectTile = (id: TileId) => {
    const s = useStore.getState();
    if (id === "preview") s.setView("tv");
    else if (id === "channels") s.setView("manager");
    else if (id === "install") s.openOverlay("loader");
    else if (id === "settings") s.setView("settings");
    else if (id === "ca") s.setView("ca");
    else if (id === "pvr") s.setView("pvr");
    else if (id === "files") s.setView("files");
    else s.openOverlay("placeholder", TILES.find((t) => t.id === id)!.label);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const s = useStore.getState();
      const k = e.key;
      const inField = (e.target as HTMLElement)?.closest?.("input,textarea,select");

      if (s.overlay) {
        if (k === "Escape" || (s.overlay === "placeholder" && k === "Enter")) {
          e.preventDefault();
          e.stopImmediatePropagation(); // don't let the screen underneath also treat this key as "back"
          s.openOverlay(null);
        }
        return; // let the dialog handle everything else
      }
      if (inField) return;
      // These screens handle their own keys.
      if (["manager", "settings", "ca", "pvr", "files"].includes(s.view)) return;

      // Watching a recording / file: playback keys instead of zapping.
      if (s.view === "tv" && s.current?.vod) {
        if (k === "Escape" || k === "Backspace") s.exitVod();
        else if (k === "Enter" && s.playState === "error") s.play({ ...s.current });
        else if (!vodKey(k)) return;
        e.preventDefault();
        return;
      }

      // Direct channel-number entry (any view): type digits, auto-jump after 1.5s.
      if (/^[0-9]$/.test(k)) {
        e.preventDefault();
        setDigits((d) => {
          const next = (d + k).slice(-4);
          window.clearTimeout(digitTimer.current);
          digitTimer.current = window.setTimeout(() => {
            setDigits("");
            useStore.getState().playNumber(parseInt(next, 10));
          }, 1500);
          return next;
        });
        return;
      }

      const handled = (() => {
        if (s.view === "home") {
          const [up, down, left, right] = TILE_NAV[tile];
          if (k === "ArrowUp") setTile(up);
          else if (k === "ArrowDown") setTile(down);
          else if (k === "ArrowLeft") setTile(left);
          else if (k === "ArrowRight") setTile(right);
          else if (k === "Enter") selectTile(tile);
          else if (k === "Escape" || k === "Backspace") s.setView("tv");
          else return false;
          return true;
        }
        if (s.view === "list") {
          if (k === "ArrowUp") s.moveCursor(-1);
          else if (k === "ArrowDown") s.moveCursor(1);
          else if (k === "PageUp") s.moveCursor(-ROWS);
          else if (k === "PageDown") s.moveCursor(ROWS);
          else if (k === "ArrowLeft") s.moveGroup(-1);
          else if (k === "ArrowRight") s.moveGroup(1);
          else if (k === "Enter") {
            const list = s.group === "All" ? s.channels : s.channels.filter((c) => c.group === s.group);
            const sel = list[s.cursor];
            if (sel && s.current?.id === sel.id && s.playState !== "error") s.setView("tv");
            else s.playCursor();
          } else if (k === "i" || k === "I") s.showInfo();
          else if (k === "Escape" || k === "Backspace") s.setView("tv");
          else if (k === "m" || k === "M" || k === "Home") s.setView("home");
          else return false;
          return true;
        }
        // full-screen TV
        if (k === "ArrowUp" || k === "ArrowRight" || k === "PageUp" || k === "+") s.zap(1);
        else if (k === "ArrowDown" || k === "ArrowLeft" || k === "PageDown" || k === "-") s.zap(-1);
        else if (k === "Enter") {
          if (s.playState === "error" && s.current) s.play({ ...s.current }); // retry
          else s.setView("list");
        } else if (k === "i" || k === "I") s.showInfo();
        else if (k === "Escape") s.showInfo(false);
        else if (k === "m" || k === "M" || k === "Home" || k === "Backspace") s.setView("home");
        else if (k === "l" || k === "L") s.setView("list");
        else return false;
        return true;
      })();
      if (handled) e.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [tile]);

  return (
    <main className="flex h-dvh w-screen items-center justify-center overflow-hidden bg-black">
      <div
        className="relative overflow-hidden bg-black font-receiver"
        style={{ width: "min(100vw, calc(100dvh * 16 / 9))", aspectRatio: "16 / 9", containerType: "size" }}
      >
        {view === "home" && <HomeMenu focus={tile} onSelect={selectTile} />}
        {view === "list" && <ChannelList />}
        {view === "manager" && <ChannelManager />}
        {view === "settings" && <SettingsScreen />}
        {view === "ca" && <CAScreen />}
        {view === "pvr" && <PvrScreen />}
        {view === "files" && <FileListScreen />}
        <VideoPlayer />
        {view === "tv" && !isVod && <InfoBar />}
        {view === "tv" && isVod && <VodBar />}
        <RecBadge />
        <StatsPanel />
        {view === "tv" && !isVod && <TvHelp />}

        {digits && (
          <div className="absolute right-[3%] top-[5%] z-50 rounded-[0.5cqw] bg-[#1a2333]/90 px-[1.6cqw] py-[0.6cqw] text-[3.2cqw] font-semibold tracking-[0.3cqw] text-[#5fdcff]">
            {digits.padEnd(3, "-")}
          </div>
        )}

        {overlay === "loader" && <PlaylistLoader onDone={() => useStore.getState().openOverlay(null)} />}
        {overlay === "placeholder" && (
          <Placeholder title={placeholderTitle} onClose={() => useStore.getState().openOverlay(null)} />
        )}
      </div>
    </main>
  );
}

/** Small, fading key legend so first-time users know how to drive the box. */
function TvHelp() {
  const [show, setShow] = useState(true);
  useEffect(() => {
    const id = window.setTimeout(() => setShow(false), 7000);
    return () => window.clearTimeout(id);
  }, []);
  return (
    <div
      className={`absolute left-[2%] top-[3%] z-30 rounded-[0.5cqw] bg-black/55 px-[1.2cqw] py-[0.8cqw] text-[1.05cqw] leading-[1.6] text-white/85 transition-opacity duration-700 ${show ? "opacity-100" : "pointer-events-none opacity-0"}`}
    >
      <b className="text-[#5fdcff]">▲▼◀▶</b> change channel · <b className="text-[#5fdcff]">OK/Enter</b> channel list ·{" "}
      <b className="text-[#5fdcff]">M</b> menu · <b className="text-[#5fdcff]">i</b> info · <b className="text-[#5fdcff]">R</b> record · <b className="text-[#5fdcff]">S</b> stats · <b className="text-[#5fdcff]">0-9</b> number
    </div>
  );
}
