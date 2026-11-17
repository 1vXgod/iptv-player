"use client";
import { type InstallTab, useInstaller } from "@/lib/installer";
import { SAMPLE_PLAYLIST } from "@/lib/sample";
import { fmtDate, type Load, useSubscription } from "@/lib/subscription";
import { playlistDisplayName, useStore } from "@/lib/store";
import { Icon } from "./icons";
import { field, GhostButton, PrimaryButton, Segmented } from "./ui";

const label = "mb-1.5 mt-3 block text-xs font-semibold uppercase tracking-wider text-white/45";
const text = { autoCapitalize: "none", autoCorrect: "off", spellCheck: false } as const;

export default function PlaylistTab({ onLoaded }: { onLoaded: () => void }) {
  const source = useStore((s) => s.playlistSource);
  const count = useStore((s) => s.channels.length);
  const I = useInstaller(onLoaded);
  const sub = useSubscription();

  return (
    <div className="m-scroll h-full overflow-y-auto px-3 pb-8 pt-3">
      {/* what's loaded now */}
      <div className="flex items-center gap-3 rounded-2xl bg-white/6 p-3.5">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#16c6f2]/15 text-[#16c6f2]"><Icon name="list" /></div>
        <div className="min-w-0 flex-1">
          <div className="truncate text-[15px] font-semibold">{playlistDisplayName(source)}</div>
          <div className="text-xs text-white/50">{count} channels</div>
        </div>
      </div>

      <SubscriptionCard load={sub.load} onRefresh={sub.refresh} mac={sub.portal?.mac} />

      <h3 className="mb-2 mt-6 px-1 text-xs font-semibold uppercase tracking-wider text-white/45">Add or change playlist</h3>
      <Segmented<InstallTab>
        value={I.tab}
        onChange={(t) => { I.setTab(t); I.setMsg(null); }}
        options={[{ value: "m3u", label: "M3U" }, { value: "xtream", label: "Xtream" }, { value: "mac", label: "MAC portal" }]}
      />

      {I.tab === "m3u" && (
        <div>
          <label className={label}>Playlist link</label>
          <input {...text} inputMode="url" value={I.url} onChange={(e) => I.setUrl(e.target.value)} onKeyDown={(e) => e.key === "Enter" && I.fromUrl()} placeholder="https://example.com/playlist.m3u" className={field} />
          <PrimaryButton onClick={I.fromUrl} disabled={I.busy} className="mt-3 w-full">{I.busy ? "Loading…" : "Load playlist"}</PrimaryButton>
          <div className="mt-2 grid grid-cols-2 gap-2">
            <label className="flex h-12 cursor-pointer items-center justify-center gap-2 rounded-xl border border-white/15 text-[15px] font-semibold active:bg-white/10">
              Choose file
              <input type="file" hidden accept=".m3u,.m3u8,audio/x-mpegurl,application/vnd.apple.mpegurl,text/plain" onChange={(e) => { void I.fromFile(e.target.files?.[0]); e.target.value = ""; }} />
            </label>
            <GhostButton onClick={() => I.apply(SAMPLE_PLAYLIST, "Built-in sample")}>Try the sample</GhostButton>
          </div>
        </div>
      )}

      {I.tab === "xtream" && (
        <form onSubmit={(e) => { e.preventDefault(); void I.fromXtream(); }}>
          <label className={label}>Server (with port)</label>
          <input {...text} inputMode="url" value={I.xServer} onChange={(e) => I.setXServer(e.target.value)} placeholder="http://server.example.com:8080" className={field} />
          <label className={label}>Username</label>
          <input {...text} autoComplete="username" value={I.xUser} onChange={(e) => I.setXUser(e.target.value)} className={field} />
          <label className={label}>Password</label>
          <input {...text} type="password" autoComplete="current-password" value={I.xPass} onChange={(e) => I.setXPass(e.target.value)} className={field} />
          <PrimaryButton onClick={() => void I.fromXtream()} disabled={I.busy} className="mt-4 w-full">{I.busy ? "Logging in…" : "Log in"}</PrimaryButton>
          <p className="mt-2 text-xs text-white/40">Downloads your channel list from the panel, the same as the M3U link would.</p>
        </form>
      )}

      {I.tab === "mac" && (
        <div>
          <div className="mt-3 rounded-2xl bg-white/6 p-4">
            <div className="text-xs font-semibold uppercase tracking-wider text-white/45">This device&apos;s MAC address</div>
            <div className="mt-1.5 break-all font-mono text-[26px] font-bold leading-tight tracking-wide text-[#ffe27a]">{I.mac || "…"}</div>
            <GhostButton onClick={() => void I.copyMac()} className="mt-3 h-11 w-full">{I.copied ? "Copied ✓" : "Copy address"}</GhostButton>
          </div>
          <ol className="mt-3 list-decimal space-y-1 pl-5 text-[13px] leading-relaxed text-white/60">
            <li>In your Xtream UI panel, add a <b className="text-white/85">MAG device</b> with this MAC address and give it a package.</li>
            <li>Enter the panel&apos;s portal address below, usually <span className="font-mono text-white/85">http://server:port/c/</span></li>
          </ol>
          <label className={label}>Portal address</label>
          <input {...text} inputMode="url" value={I.portal} onChange={(e) => I.setPortal(e.target.value)} onKeyDown={(e) => e.key === "Enter" && I.fromPortal()} placeholder="http://server.example.com:8080/c/" className={field} />
          <PrimaryButton onClick={I.fromPortal} disabled={I.busy || !I.mac} className="mt-3 w-full">{I.busy ? "Connecting…" : "Connect"}</PrimaryButton>
        </div>
      )}

      {I.msg && (
        <div className={`mt-4 rounded-xl px-3.5 py-3 text-sm leading-snug ${I.msg.ok ? "bg-emerald-500/20 text-emerald-200" : "bg-red-500/20 text-red-200"}`}>{I.msg.text}</div>
      )}
    </div>
  );
}

/** Gold subscription card: playlist/account status, expiry date and days left. */
function SubscriptionCard({ load, onRefresh, mac }: { load: Load; onRefresh: () => void; mac?: string }) {
  let body: React.ReactNode;
  if (load.state === "loading") body = <div className="text-sm text-[#2a1f00]/80">Checking subscription…</div>;
  else if (load.state === "none") body = <div className="text-[13px] leading-snug text-[#2a1f00]/85">Expiry shows for Xtream logins and MAC portals. Plain M3U files have no subscription info.</div>;
  else if (load.state === "error") body = <div className="text-[13px] leading-snug text-[#7a1010]">Couldn&apos;t read the subscription: {load.msg}</div>;
  else {
    const a = load.acc;
    const exp = a.exp_date ? Number(a.exp_date) : null;
    const days = exp ? Math.ceil((exp * 1000 - Date.now()) / 86_400_000) : null;
    body = (
      <>
        <div className="text-[11px] font-semibold uppercase tracking-[0.15em] text-[#3a2a00]/70">Expires</div>
        <div className="mt-1 text-[26px] font-bold leading-none text-[#2a1f00]">{exp ? fmtDate(exp) : "Unlimited"}</div>
        {days !== null && (
          <div className={`mt-1.5 text-sm font-semibold ${days <= 7 ? "text-[#b3121a]" : "text-[#2a1f00]/80"}`}>{days > 0 ? `${days} day${days === 1 ? "" : "s"} left` : "Expired"}</div>
        )}
        <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[12px] font-medium text-[#2a1f00]/80">
          <span>Status: <b>{a.status || "Unknown"}</b></span>
          {a.max_connections !== undefined && <span>Connections: <b>{a.active_cons ?? 0}/{a.max_connections}</b></span>}
          {a.created_at && <span>Since: <b>{fmtDate(Number(a.created_at))}</b></span>}
        </div>
        {mac && <div className="mt-1.5 font-mono text-[12px] text-[#2a1f00]/70">{mac}</div>}
      </>
    );
  }
  return (
    <div className="relative mt-3 overflow-hidden rounded-2xl p-4 shadow-lg" style={{ background: "linear-gradient(150deg,#fde46a 0%,#f6c514 55%,#e2a800 100%)" }}>
      <div className="pointer-events-none absolute -right-8 -top-10 h-32 w-32 rounded-full bg-white/25" />
      <div className="relative flex items-start justify-between">
        <div className="text-sm font-bold text-[#2a1f00]">Subscription</div>
        <button onClick={onRefresh} aria-label="Refresh" className="-mr-2 -mt-2 flex h-10 w-10 items-center justify-center rounded-full text-[#2a1f00]/70 active:bg-black/10">↻</button>
      </div>
      <div className="relative -mt-1">{body}</div>
    </div>
  );
}
