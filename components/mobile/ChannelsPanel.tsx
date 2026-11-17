"use client";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { type Channel, channelsInGroup } from "@/lib/m3u";
import { useStore } from "@/lib/store";
import { Icon } from "./icons";
import { ChannelBadge } from "./MobilePlayer";
import { buzz } from "./utils";

interface RowProps {
  c: Channel; active: boolean; edit: boolean; canUp: boolean; canDown: boolean; confirming: boolean;
  onPlay: (c: Channel) => void; onMove: (c: Channel, dir: -1 | 1) => void; onDelete: (c: Channel) => void;
}

const Row = memo(function Row({ c, active, edit, canUp, canDown, confirming, onPlay, onMove, onDelete }: RowProps) {
  const small = "flex h-10 w-10 items-center justify-center rounded-full text-white/80 active:bg-white/15 disabled:opacity-25";
  return (
    <div data-active={active} className={`m-row flex items-center border-l-[3px] pr-2 ${active ? "border-[#16c6f2] bg-[#16c6f2]/10" : "border-transparent"}`}>
      <button onClick={() => onPlay(c)} className="flex min-h-[60px] min-w-0 flex-1 items-center gap-3 py-2 pl-2.5 text-left active:bg-white/5">
        <ChannelBadge c={c} size={44} />
        <div className="min-w-0 flex-1">
          <div className={`truncate text-[15px] leading-tight ${active ? "font-semibold text-white" : "font-medium text-white/90"}`}>{c.name}</div>
          <div className="mt-0.5 truncate text-xs text-white/45">{c.number} · {c.group}</div>
        </div>
        {active && !edit && <span className="m-eq mr-1" aria-label="Playing"><i /><i /><i /></span>}
      </button>
      {edit && (
        <div className="flex shrink-0 items-center">
          <button aria-label="Move up" disabled={!canUp} onClick={() => onMove(c, -1)} className={small}><Icon name="up" className="h-5 w-5" /></button>
          <button aria-label="Move down" disabled={!canDown} onClick={() => onMove(c, 1)} className={small}><Icon name="down" className="h-5 w-5" /></button>
          <button aria-label="Delete channel" onClick={() => onDelete(c)} className={`${small} ${confirming ? "bg-red-500/25 text-red-300" : "text-red-300/80"}`}>
            {confirming ? <Icon name="check" className="h-5 w-5" /> : <Icon name="trash" className="h-5 w-5" />}
          </button>
        </div>
      )}
    </div>
  );
});

/** Search + group chips + the channel list. Tap a channel to play it. The pencil switches on reorder / delete. */
export default function ChannelsPanel({ onPick, onAdd }: { onPick?: () => void; onAdd?: () => void }) {
  const channels = useStore((s) => s.channels);
  const groups = useStore((s) => s.groups);
  const group = useStore((s) => s.group);
  const currentId = useStore((s) => s.current?.id);
  const [q, setQ] = useState("");
  const [edit, setEdit] = useState(false);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const list = useMemo(() => {
    const base = channelsInGroup(channels, group);
    const n = q.trim().toLowerCase();
    return n ? base.filter((c) => c.name.toLowerCase().includes(n) || String(c.number) === n) : base;
  }, [channels, group, q]);

  const counts = useMemo(() => {
    const m = new Map<string, number>();
    for (const c of channels) m.set(c.group, (m.get(c.group) ?? 0) + 1);
    return m;
  }, [channels]);

  // start with the playing channel in view
  useEffect(() => {
    listRef.current?.querySelector('[data-active="true"]')?.scrollIntoView({ block: "center" });
  }, []);
  useEffect(() => {
    if (!confirmId) return;
    const id = window.setTimeout(() => setConfirmId(null), 3000);
    return () => window.clearTimeout(id);
  }, [confirmId]);

  const onPlay = useCallback((c: Channel) => {
    buzz(8);
    const s = useStore.getState();
    s.play(c);
    s.setGroup(s.group); // keeps zapping inside the group that's on screen
    onPick?.();
  }, [onPick]);

  const onMove = useCallback((c: Channel, dir: -1 | 1) => {
    const s = useStore.getState();
    const visible = channelsInGroup(s.channels, s.group);
    const n = q.trim().toLowerCase();
    const shown = n ? visible.filter((x) => x.name.toLowerCase().includes(n)) : visible;
    const j = shown.indexOf(c) + dir;
    if (j < 0 || j >= shown.length) return;
    s.moveChannel(s.channels.indexOf(c), s.channels.indexOf(shown[j]));
  }, [q]);

  const onDelete = useCallback((c: Channel) => {
    if (confirmId === c.id) { setConfirmId(null); useStore.getState().deleteChannel(useStore.getState().channels.indexOf(c)); }
    else setConfirmId(c.id);
  }, [confirmId]);

  if (!channels.length) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 px-8 text-center">
        <Icon name="tv" className="h-12 w-12 text-white/30" />
        <div className="text-lg font-semibold">No channels yet</div>
        <div className="text-sm text-white/55">Add a playlist, an Xtream login or a MAC portal to get started.</div>
        {onAdd && <button onClick={onAdd} className="mt-2 h-12 rounded-xl bg-[#16c6f2] px-6 text-[15px] font-semibold text-[#062033] active:opacity-80">Add playlist</button>}
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex shrink-0 items-center gap-2 px-3 pb-2 pt-3">
        <div className="relative flex-1">
          <Icon name="search" className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-white/40" />
          <input
            type="search"
            inputMode="search"
            enterKeyHint="search"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            placeholder={`Search ${channels.length} channels`}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            className="h-11 w-full rounded-xl border border-white/10 bg-white/6 pl-10 pr-9 text-base text-white outline-none placeholder:text-white/35 focus:border-[#16c6f2]"
          />
          {q && (
            <button aria-label="Clear search" onClick={() => setQ("")} className="absolute right-1 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center text-white/50">
              <Icon name="x" className="h-4 w-4" />
            </button>
          )}
        </div>
        <button
          aria-label={edit ? "Done editing" : "Edit channel order"}
          aria-pressed={edit}
          onClick={() => { setEdit((e) => !e); setConfirmId(null); }}
          className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border transition-colors ${edit ? "border-[#16c6f2] bg-[#16c6f2] text-[#062033]" : "border-white/10 bg-white/6 text-white/75 active:bg-white/12"}`}
        >
          <Icon name={edit ? "check" : "edit"} className="h-5 w-5" />
        </button>
      </div>

      <div className="no-scrollbar flex shrink-0 gap-2 overflow-x-auto px-3 pb-2">
        {groups.map((g) => {
          const on = g === group;
          return (
            <button
              key={g}
              onClick={() => useStore.getState().setGroup(g)}
              className={`h-9 shrink-0 rounded-full px-3.5 text-[13px] font-semibold transition-colors ${on ? "bg-[#16c6f2] text-[#062033]" : "bg-white/8 text-white/75 active:bg-white/15"}`}
            >
              {g}
              <span className={`ml-1.5 text-[11px] ${on ? "text-[#062033]/65" : "text-white/40"}`}>{g === "All" ? channels.length : counts.get(g) ?? 0}</span>
            </button>
          );
        })}
      </div>
      {edit && <div className="shrink-0 bg-[#16c6f2]/12 px-4 py-1.5 text-xs text-[#9fe4ff]">Reorder with the arrows. Deleted channels come back with “Reset channel order” in Settings.</div>}

      <div ref={listRef} className="m-scroll min-h-0 flex-1 overflow-y-auto pb-3">
        {list.length === 0 && <div className="px-6 py-10 text-center text-sm text-white/45">No channels match “{q}”.</div>}
        {list.map((c, i) => (
          <Row
            key={c.id}
            c={c}
            active={c.id === currentId}
            edit={edit}
            canUp={i > 0}
            canDown={i < list.length - 1}
            confirming={confirmId === c.id}
            onPlay={onPlay}
            onMove={onMove}
            onDelete={onDelete}
          />
        ))}
      </div>
    </div>
  );
}
