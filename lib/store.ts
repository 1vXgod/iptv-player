"use client";
import { create } from "zustand";
import { ALL_GROUP, Channel, channelsInGroup, groupNames, parseM3U } from "./m3u";
import { SAMPLE_PLAYLIST } from "./sample";

export type View = "home" | "list" | "tv" | "manager" | "settings" | "ca" | "pvr" | "files";
export type Overlay = null | "loader" | "placeholder";
export type PlayState = "idle" | "loading" | "playing" | "error";

export interface TechInfo {
  width?: number;
  height?: number;
  videoCodec?: string;
  audioCodec?: string;
  bitrate?: number;
}

export interface Settings {
  infoTimeout: number; // seconds the info bar stays up
  clock24: boolean;
  startView: "tv" | "home";
  transcode: "auto" | "always" | "off"; // ffmpeg use for MPEG-TS channels
  audioFix: "auto" | "always"; // always: every live channel's audio goes through ffmpeg (clean AAC)
  ui: "auto" | "phone" | "tv"; // which interface to show; auto = phone UI on touch devices, TV UI on a PC
}

export const DEFAULT_SETTINGS: Settings = { infoTimeout: 5, clock24: true, startView: "tv", transcode: "auto", audioFix: "auto", ui: "auto" };

interface State {
  channels: Channel[];
  playlistSource: string;
  playlistText: string;
  groups: string[];
  group: string;
  cursor: number; // index within the current group's list
  current: Channel | null;
  tuneNonce: number; // bumps on every (re)tune; the player reloads only when this changes
  view: View;
  returnView: View; // where Esc goes after watching a recording / file
  lastLive: Channel | null; // live channel to return to after VOD playback
  overlay: Overlay;
  placeholderTitle: string;
  infoVisible: boolean;
  infoNonce: number; // bumps to restart the info-bar auto-hide timer
  playState: PlayState;
  errorDetail: string;
  notice: string; // non-fatal playback note (e.g. audio unsupported)
  soundBlocked: boolean; // browser blocked autoplay with sound; muted until the user interacts
  muted: boolean; // user mute (U key / mute button)
  volume: number; // 0..1, remembered between sessions
  volumeNonce: number; // bumps on every change so the on-screen volume bar re-shows
  method: string; // playback method that is currently working (for the stats panel)
  audioOk: boolean | null; // audio watchdog result: null = unknown / not measurable
  tech: TechInfo;
  settings: Settings;
  hydrated: boolean;

  loadPlaylist: (text: string, source: string, restoreUrl?: string) => number;
  setGroup: (g: string) => void;
  moveGroup: (delta: number) => void;
  moveCursor: (delta: number) => void;
  play: (c: Channel) => void;
  playCursor: () => void;
  zap: (delta: number) => void;
  playNumber: (n: number) => void;
  playVod: (c: Channel, from: View) => void;
  exitVod: () => void;
  setView: (v: View) => void;
  openOverlay: (o: Overlay, title?: string) => void;
  showInfo: (v?: boolean) => void;
  setPlayState: (s: PlayState, detail?: string) => void;
  setTech: (t: TechInfo) => void;
  setNotice: (n: string) => void;
  changeVolume: (delta: number) => void;
  updateSettings: (p: Partial<Settings>) => void;
  // channel manager
  moveChannel: (from: number, to: number) => void;
  deleteChannel: (index: number) => void;
  resetOrder: () => void;
  hydrate: () => void;
}

const LS_PLAYLIST = "mirax.playlist";
const LS_CHANNEL = "mirax.lastChannel";
const LS_SETTINGS = "mirax.settings";
const LS_ORDER = "mirax.order";
const LS_VOLUME = "mirax.volume";

function lsGet(k: string): string | null {
  try { return localStorage.getItem(k); } catch { return null; }
}
function lsSet(k: string, v: string) {
  try { localStorage.setItem(k, v); } catch { /* quota / private mode */ }
}
function lsDel(k: string) {
  try { localStorage.removeItem(k); } catch { /* ignore */ }
}

/** Saved channel arrangement for a playlist: ordered stream URLs + deleted URLs. */
interface SavedOrder { source: string; order: string[]; hidden: string[] }

function renumber(list: Channel[]): Channel[] {
  return list.map((c, i) => (c.number === i + 1 ? c : { ...c, number: i + 1 }));
}

function applySavedOrder(parsed: Channel[], source: string): Channel[] {
  let saved: SavedOrder | null = null;
  try { saved = JSON.parse(lsGet(LS_ORDER) || "null"); } catch { /* ignore */ }
  if (!saved || saved.source !== source) return parsed;
  const hidden = new Set(saved.hidden);
  const rank = new Map(saved.order.map((u, i) => [u, i]));
  const visible = parsed.filter((c) => !hidden.has(c.url));
  // Known channels in saved order; new ones (not in saved order) keep playlist order at the end.
  const sorted = [...visible].sort((a, b) => (rank.get(a.url) ?? 1e9 + a.number) - (rank.get(b.url) ?? 1e9 + b.number));
  return renumber(sorted);
}

export const useStore = create<State>((set, get) => {
  /** Replace the channel list (after reorder/delete) without re-tuning. */
  const commitChannels = (list: Channel[], hiddenAdd: string[] = []) => {
    const channels = renumber(list);
    const { current, group, playlistSource } = get();
    const cur = current ? channels.find((c) => c.id === current.id) ?? current : null;
    const groups = groupNames(channels);
    set({ channels, current: cur, groups, group: groups.includes(group) ? group : ALL_GROUP });
    let prevHidden: string[] = [];
    try {
      const s = JSON.parse(lsGet(LS_ORDER) || "null") as SavedOrder | null;
      if (s && s.source === playlistSource) prevHidden = s.hidden;
    } catch { /* ignore */ }
    const saved: SavedOrder = { source: playlistSource, order: channels.map((c) => c.url), hidden: [...prevHidden, ...hiddenAdd] };
    lsSet(LS_ORDER, JSON.stringify(saved));
  };

  return {
    channels: [],
    playlistSource: "",
    playlistText: "",
    groups: [ALL_GROUP],
    group: ALL_GROUP,
    cursor: 0,
    current: null,
    tuneNonce: 0,
    view: "tv",
    returnView: "home",
    lastLive: null,
    overlay: null,
    placeholderTitle: "",
    infoVisible: false,
    infoNonce: 0,
    playState: "idle",
    errorDetail: "",
    notice: "",
    soundBlocked: false,
    muted: false,
    volume: 1,
    volumeNonce: 0,
    method: "",
    audioOk: null,
    tech: {},
    settings: DEFAULT_SETTINGS,
    hydrated: false,

    loadPlaylist(text, source, restoreUrl) {
      const parsed = parseM3U(text);
      if (!parsed.length) return 0;
      const channels = applySavedOrder(parsed, source);
      if (!channels.length) return 0;
      const start = channels.find((c) => c.url === restoreUrl) ?? channels[0];
      set({
        channels, playlistSource: source, playlistText: text,
        groups: groupNames(channels), group: ALL_GROUP,
        cursor: channels.indexOf(start),
      });
      lsSet(LS_PLAYLIST, JSON.stringify({ text, source }));
      get().play(start);
      return channels.length;
    },

    setGroup(g) {
      const { current, channels } = get();
      const list = channelsInGroup(channels, g);
      const idx = current ? list.findIndex((c) => c.id === current.id) : -1;
      set({ group: g, cursor: Math.max(0, idx) });
    },
    moveGroup(delta) {
      const { groups, group } = get();
      const i = groups.indexOf(group);
      get().setGroup(groups[(i + delta + groups.length) % groups.length]);
    },
    moveCursor(delta) {
      const { channels, group, cursor } = get();
      const n = channelsInGroup(channels, group).length;
      if (!n) return;
      let next = cursor + delta;
      if (Math.abs(delta) === 1) next = (next + n) % n; // wrap on single steps
      else next = Math.min(n - 1, Math.max(0, next));
      set({ cursor: next });
    },

    play(c) {
      set({
        current: c, tuneNonce: get().tuneNonce + 1,
        playState: "loading", errorDetail: "", notice: "", tech: {}, method: "", audioOk: null,
        infoVisible: true, infoNonce: get().infoNonce + 1,
      });
      if (!c.vod) lsSet(LS_CHANNEL, c.url);
    },
    playVod(c, from) {
      const cur = get().current;
      set({ returnView: from, lastLive: cur && !cur.vod ? cur : get().lastLive, view: "tv" });
      get().play({ ...c, vod: c.vod ?? "native" });
    },
    exitVod() {
      const { lastLive, returnView, channels } = get();
      const live = lastLive ?? channels[0];
      if (live) get().play(live);
      set({ view: returnView });
    },
    playCursor() {
      const { channels, group, cursor } = get();
      const c = channelsInGroup(channels, group)[cursor];
      if (c) get().play(c);
    },
    zap(delta) {
      const { channels, group, current } = get();
      const list = channelsInGroup(channels, group);
      if (!list.length) return;
      const i = current ? list.findIndex((c) => c.id === current.id) : -1;
      const next = (i + delta + list.length) % list.length;
      set({ cursor: next });
      get().play(list[next]);
    },
    playNumber(n) {
      const { channels } = get();
      const c = channels.find((x) => x.number === n);
      if (!c) return;
      set({ group: ALL_GROUP, cursor: channels.indexOf(c) });
      get().play(c);
    },

    setView(v) { set({ view: v }); },
    openOverlay(o, title = "") { set({ overlay: o, placeholderTitle: title }); },
    showInfo(v) {
      set({ infoVisible: v ?? !get().infoVisible, infoNonce: get().infoNonce + 1 });
    },
    setPlayState(s, detail = "") { set({ playState: s, errorDetail: detail }); },
    setNotice(n) { set({ notice: n }); },
    changeVolume(delta) {
      const volume = Math.round(Math.max(0, Math.min(1, get().volume + delta)) * 100) / 100;
      set({ volume, volumeNonce: get().volumeNonce + 1 });
      lsSet(LS_VOLUME, String(volume));
    },
    setTech(t) { set({ tech: { ...get().tech, ...t } }); },
    updateSettings(p) {
      const settings = { ...get().settings, ...p };
      set({ settings });
      lsSet(LS_SETTINGS, JSON.stringify(settings));
    },

    moveChannel(from, to) {
      const list = [...get().channels];
      if (from < 0 || from >= list.length) return;
      const target = Math.max(0, Math.min(list.length - 1, to));
      if (target === from) return;
      const [c] = list.splice(from, 1);
      list.splice(target, 0, c);
      commitChannels(list);
    },
    deleteChannel(index) {
      const list = [...get().channels];
      if (list.length <= 1 || !list[index]) return;
      const [c] = list.splice(index, 1);
      commitChannels(list, [c.url]);
    },
    resetOrder() {
      lsDel(LS_ORDER);
      const { playlistText, current } = get();
      const channels = parseM3U(playlistText);
      const groups = groupNames(channels);
      const cur = current ? channels.find((c) => c.url === current.url) ?? current : null;
      set({ channels, groups, group: ALL_GROUP, current: cur, cursor: cur ? Math.max(0, channels.indexOf(cur)) : 0 });
    },

    hydrate() {
      if (get().hydrated) return;
      let settings = DEFAULT_SETTINGS;
      try { settings = { ...DEFAULT_SETTINGS, ...JSON.parse(lsGet(LS_SETTINGS) || "{}") }; } catch { /* defaults */ }
      const savedVol = parseFloat(lsGet(LS_VOLUME) ?? "");
      set({ hydrated: true, settings, view: settings.startView, volume: Number.isFinite(savedVol) ? Math.max(0, Math.min(1, savedVol)) : 1 });
      const saved = lsGet(LS_PLAYLIST);
      const last = lsGet(LS_CHANNEL) ?? undefined;
      if (saved) {
        try {
          const { text, source } = JSON.parse(saved);
          if (get().loadPlaylist(text, source, last)) return;
        } catch { /* fall back to sample */ }
      }
      get().loadPlaylist(SAMPLE_PLAYLIST, "Built-in sample", last);
    },
  };
});

/** Clear every value this app stores in the browser. */
export function clearAllLocalData() {
  for (const k of [LS_PLAYLIST, LS_CHANNEL, LS_SETTINGS, LS_ORDER, "mirax.strategy"]) lsDel(k);
}

/** Display name for a playlist source without leaking credentials. */
export function playlistDisplayName(source: string): string {
  if (!source) return "—";
  try {
    const u = new URL(source);
    const file = u.pathname.split("/").filter(Boolean).pop();
    return file && /\.m3u8?$/i.test(file) ? `${file} (${u.host})` : u.host;
  } catch {
    return source; // file name or "Built-in sample"
  }
}

/** Human-readable codec tags derived from the current stream. */
export function codecTags(t: TechInfo): string[] {
  const tags: string[] = [];
  const v = t.videoCodec ?? "";
  if (/^(avc|h264)/i.test(v)) tags.push("H264");
  else if (/^(hvc|hev|h265)/i.test(v)) tags.push("H265");
  else if (v) tags.push(v.split(".")[0].toUpperCase());
  const a = t.audioCodec ?? "";
  if (/^mp4a\.40/i.test(a)) tags.push("AAC");
  else if (/^(ac-3|ec-3)/i.test(a)) tags.push("AC3");
  else tags.push("MPEG");
  if ((t.height ?? 0) >= 720) tags.push("HD");
  return tags;
}
