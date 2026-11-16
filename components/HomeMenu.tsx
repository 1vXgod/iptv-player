"use client";
import { Clock } from "./ui";
import { VIDEO_FRAMES } from "./VideoPlayer";

export type TileId = "preview" | "channels" | "install" | "settings" | "pvr" | "files" | "ca";
type MenuTile = Exclude<TileId, "preview">;

/** Tile skins. `base` is the tile gradient, `blob` the soft decorative shape colour. Edit here to re-skin. */
export const TILES: { id: MenuTile; label: string; base: [string, string]; blob: string }[] = [
  { id: "channels", label: "Channel Manager", base: ["#4b97ff", "#2c64ee"], blob: "#7db8ff" },
  { id: "install", label: "Installation", base: ["#4a8dff", "#2a5fe8"], blob: "#78b0ff" },
  { id: "settings", label: "Settings", base: ["#47a8ff", "#2b7fec"], blob: "#7cc4ff" },
  { id: "pvr", label: "PVR Manager", base: ["#4fd8f2", "#20aedb"], blob: "#8ae9fa" },
  { id: "files", label: "File List", base: ["#45e845", "#17c21f"], blob: "#86f586" },
  { id: "ca", label: "CA", base: ["#fbd83a", "#ecb500"], blob: "#ffe781" },
];

/** Grid neighbours for arrow-key navigation: [up, down, left, right]. */
export const TILE_NAV: Record<TileId, [TileId, TileId, TileId, TileId]> = {
  preview: ["preview", "settings", "preview", "channels"],
  channels: ["channels", "files", "preview", "install"],
  install: ["install", "ca", "channels", "install"],
  settings: ["preview", "settings", "settings", "pvr"],
  pvr: ["preview", "pvr", "settings", "files"],
  files: ["channels", "files", "pvr", "ca"],
  ca: ["install", "ca", "files", "ca"],
};

// Layout in % of the 16:9 stage, measured from the reference photo.
const POS: Record<MenuTile, { l: number; t: number; w: number; h: number }> = {
  channels: { l: 53.0, t: 22.5, w: 20.4, h: 30.5 },
  install: { l: 75.4, t: 22.5, w: 19.6, h: 30.5 },
  settings: { l: 4.6, t: 58.3, w: 21.9, h: 19 },
  pvr: { l: 27.7, t: 58.3, w: 21.9, h: 19 },
  files: { l: 50.8, t: 58.3, w: 21.9, h: 19 },
  ca: { l: 73.9, t: 58.3, w: 21.9, h: 19 },
};

export default function HomeMenu({ focus, onSelect }: { focus: TileId; onSelect: (id: TileId) => void }) {
  return (
    <div className="mx-view-in absolute inset-0 overflow-hidden">
      <Backdrop />

      <Clock className="absolute right-[4.6%] top-[7.2%] drop-shadow-[0_0.15cqw_0.3cqw_rgba(0,0,30,.35)]" />

      {/* frame around the live preview (the video layer itself is the persistent VideoPlayer) */}
      {/* selectable like a tile: OK opens this channel full screen */}
      <div
        className="absolute cursor-pointer bg-black"
        onClick={() => onSelect("preview")}
        style={{
          left: `${VIDEO_FRAMES.home.left}%`, top: `${VIDEO_FRAMES.home.top}%`,
          width: `${VIDEO_FRAMES.home.width}%`, height: `${VIDEO_FRAMES.home.height}%`,
          boxShadow:
            focus === "preview"
              ? "0 0 0 0.42cqw #ffffff, 0 0 2.4cqw 0.6cqw rgba(160,220,255,.6), 0 1cqw 2.2cqw rgba(5,15,80,.45)"
              : "0 0 0 0.3cqw #eef3fb, 0 0.8cqw 2cqw rgba(5,15,80,.45)",
          transition: "box-shadow 180ms ease-out",
        }}
      />

      {TILES.map((t) => {
        const p = POS[t.id];
        const active = focus === t.id;
        const big = t.id === "channels" || t.id === "install";
        return (
          <button
            key={t.id}
            tabIndex={-1}
            onClick={() => onSelect(t.id)}
            className="absolute overflow-hidden rounded-[1.1cqw] text-white outline-none"
            style={{
              left: `${p.l}%`, top: `${p.t}%`, width: `${p.w}%`, height: `${p.h}%`,
              background: `linear-gradient(165deg, ${t.base[0]} 0%, ${t.base[1]} 100%)`,
              boxShadow: active
                ? "0 0 0 0.32cqw #ffffff, 0 0 2.2cqw 0.4cqw rgba(160,220,255,.55), 0 1cqw 2.2cqw rgba(5,15,80,.45)"
                : "0 0.5cqw 1.2cqw rgba(5,15,80,.32), inset 0 0.12cqw 0 rgba(255,255,255,.35)",
              transform: active ? "scale(1.045)" : "scale(1)",
              transition: "transform 180ms cubic-bezier(.3,.7,.3,1), box-shadow 180ms ease-out",
              willChange: "transform",
              zIndex: active ? 10 : 1,
            }}
          >
            <TileDeco color={t.blob} big={big} />
            {/* glossy top sheen */}
            <div className="pointer-events-none absolute inset-x-0 top-0 h-1/2 bg-gradient-to-b from-white/18 to-transparent" />

            <div className={`absolute inset-x-0 flex justify-center ${big ? "top-[10%] h-[58%]" : "top-[8%] h-[58%]"}`}>
              <div className="aspect-square h-full drop-shadow-[0_0.25cqw_0.35cqw_rgba(0,20,90,.28)]">
                <TileIcon id={t.id} />
              </div>
            </div>
            <span
              className={`absolute inset-x-0 text-center font-medium leading-none tracking-[0.01em] ${big ? "bottom-[10%] text-[1.75cqw]" : "bottom-[11%] text-[1.6cqw]"}`}
              style={{ textShadow: "0 0.12cqw 0.25cqw rgba(0,20,80,.35)" }}
            >
              {t.label}
            </span>
          </button>
        );
      })}
    </div>
  );
}

/** Blue backdrop with the receiver's pink/violet light swooshes and fine curved lines. */
export function Backdrop() {
  return (
    <svg className="pointer-events-none absolute inset-0 h-full w-full" viewBox="0 0 1600 900" preserveAspectRatio="none" aria-hidden>
      <defs>
        <linearGradient id="bd-bg" x1="0" y1="0" x2="0.35" y2="1">
          <stop offset="0" stopColor="#2a4cf0" />
          <stop offset="0.55" stopColor="#1f3fdc" />
          <stop offset="1" stopColor="#1a33c4" />
        </linearGradient>
        <radialGradient id="bd-glow" cx="0.82" cy="0.18" r="0.55">
          <stop offset="0" stopColor="#5b8cff" stopOpacity="0.55" />
          <stop offset="1" stopColor="#5b8cff" stopOpacity="0" />
        </radialGradient>
        <radialGradient id="bd-glow2" cx="0.1" cy="0.95" r="0.5">
          <stop offset="0" stopColor="#3a2fd0" stopOpacity="0.5" />
          <stop offset="1" stopColor="#3a2fd0" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="bd-pink" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#ff4fd8" stopOpacity="0.95" />
          <stop offset="0.45" stopColor="#b25cff" stopOpacity="0.55" />
          <stop offset="1" stopColor="#6a7cff" stopOpacity="0" />
        </linearGradient>
        <linearGradient id="bd-white" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#ffffff" stopOpacity="0.9" />
          <stop offset="1" stopColor="#ffffff" stopOpacity="0" />
        </linearGradient>
        <linearGradient id="bd-line" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#9fc0ff" stopOpacity="0" />
          <stop offset="0.5" stopColor="#9fc0ff" stopOpacity="0.35" />
          <stop offset="1" stopColor="#9fc0ff" stopOpacity="0" />
        </linearGradient>
        <filter id="bd-blur" x="-20%" y="-50%" width="140%" height="200%">
          <feGaussianBlur stdDeviation="14" />
        </filter>
        <filter id="bd-blur-s" x="-20%" y="-50%" width="140%" height="200%">
          <feGaussianBlur stdDeviation="3" />
        </filter>
      </defs>

      <rect width="1600" height="900" fill="url(#bd-bg)" />
      <rect width="1600" height="900" fill="url(#bd-glow)" />
      <rect width="1600" height="900" fill="url(#bd-glow2)" />

      {/* swooshes, top-left */}
      <path d="M-60 210 C 160 120, 360 110, 640 150 L 640 175 C 380 150, 170 165, -60 260 Z" fill="url(#bd-pink)" filter="url(#bd-blur)" />
      <path d="M-40 190 C 170 120, 380 118, 600 148" stroke="url(#bd-pink)" strokeWidth="10" fill="none" filter="url(#bd-blur-s)" />
      <path d="M-40 232 C 150 160, 330 150, 520 168" stroke="url(#bd-white)" strokeWidth="3" fill="none" filter="url(#bd-blur-s)" />
      <path d="M-30 300 C 140 230, 300 215, 470 225" stroke="url(#bd-pink)" strokeWidth="5" fill="none" opacity="0.6" filter="url(#bd-blur-s)" />

      {/* fine curved lines across the screen */}
      <g fill="none" stroke="url(#bd-line)" strokeWidth="1.5">
        <path d="M0 470 C 400 380, 900 420, 1600 300" />
        <path d="M0 520 C 450 430, 950 470, 1600 350" opacity="0.7" />
        <path d="M0 860 C 500 760, 1000 820, 1600 700" opacity="0.6" />
      </g>
      {/* soft light band on the right, behind the big tiles */}
      <path d="M1000 330 C 1200 260, 1420 240, 1650 200 L 1650 260 C 1420 300, 1220 330, 1000 380 Z" fill="#8fb6ff" opacity="0.18" filter="url(#bd-blur)" />
    </svg>
  );
}

/** Soft organic shapes inside each tile, like the receiver's tile art. */
function TileDeco({ color, big }: { color: string; big: boolean }) {
  return (
    <svg className="pointer-events-none absolute inset-0 h-full w-full" viewBox="0 0 200 200" preserveAspectRatio="none" aria-hidden>
      {big ? (
        <>
          <path d="M-10 0 H 210 V 40 C 160 70, 120 20, 70 55 C 40 75, 10 60, -10 70 Z" fill={color} opacity="0.35" />
          <path d="M120 210 C 140 160, 180 150, 210 120 V 210 Z" fill={color} opacity="0.3" />
        </>
      ) : (
        <>
          <circle cx="185" cy="15" r="70" fill={color} opacity="0.28" />
          <circle cx="10" cy="200" r="55" fill={color} opacity="0.2" />
        </>
      )}
    </svg>
  );
}

/** Gear outline generated from polar coordinates: evenly spaced trapezoid teeth. */
function gearPath(cx: number, cy: number, teeth: number, rOuter: number, rInner: number): string {
  const pts: string[] = [];
  const step = (Math.PI * 2) / teeth;
  const tip = step * 0.24; // half-width of the tooth tip
  const base = step * 0.34; // half-width of the tooth base
  const pt = (a: number, r: number) => `${(cx + r * Math.cos(a)).toFixed(2)} ${(cy + r * Math.sin(a)).toFixed(2)}`;
  for (let i = 0; i < teeth; i++) {
    const a = i * step - Math.PI / 2;
    pts.push(pt(a - base, rInner), pt(a - tip, rOuter), pt(a + tip, rOuter), pt(a + base, rInner));
    // valley arc to the next tooth
    pts.push(pt(a + step / 2, rInner));
  }
  return `M ${pts.join(" L ")} Z`;
}
const GEAR = gearPath(50, 50, 8, 45, 35);

function TileIcon({ id }: { id: TileId }) {
  const cls = "h-full w-full overflow-visible";
  switch (id) {
    case "channels":
      return (
        <svg viewBox="0 0 100 100" className={cls}>
          <defs>
            <linearGradient id="cm-screen" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#f4f9ff" />
              <stop offset="1" stopColor="#d6e8ff" />
            </linearGradient>
          </defs>
          {/* monitor */}
          <rect x="6" y="14" width="80" height="56" rx="6" fill="#ffffff" />
          <rect x="11" y="19" width="70" height="44" rx="2.5" fill="url(#cm-screen)" />
          <rect x="40" y="70" width="12" height="9" fill="#ffffff" />
          <rect x="28" y="79" width="36" height="5" rx="2.5" fill="#ffffff" />
          {/* play tile + list lines */}
          <rect x="17" y="25" width="22" height="16" rx="2.5" fill="#2f6df0" />
          <path d="M25.5 29 L 32 33 L 25.5 37 Z" fill="#ffffff" />
          <rect x="44" y="26" width="30" height="4" rx="2" fill="#2f6df0" />
          <rect x="44" y="34" width="22" height="4" rx="2" fill="#7ea8f7" />
          <rect x="17" y="47" width="46" height="4" rx="2" fill="#7ea8f7" />
          <rect x="17" y="54" width="34" height="4" rx="2" fill="#7ea8f7" />
          {/* pencil */}
          <g transform="rotate(42 80 52)">
            <rect x="74" y="24" width="12" height="42" rx="1.5" fill="#ff5b57" />
            <rect x="74" y="24" width="4" height="42" fill="#ff8a86" />
            <rect x="74" y="18" width="12" height="7" rx="2" fill="#ffc9d6" />
            <rect x="74" y="24" width="12" height="3" fill="#d9dee8" />
            <path d="M74 66 L 86 66 L 80 78 Z" fill="#ffd79a" />
            <path d="M78 74 L 82 74 L 80 78 Z" fill="#3b3b4a" />
          </g>
        </svg>
      );

    case "install":
      return (
        <svg viewBox="0 0 100 100" className={cls}>
          <defs>
            <radialGradient id="in-globe" cx="0.4" cy="0.35" r="0.7">
              <stop offset="0" stopColor="#e6f6ff" />
              <stop offset="1" stopColor="#9fd4ff" />
            </radialGradient>
            <linearGradient id="in-panel" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#ffd84a" />
              <stop offset="1" stopColor="#f2b400" />
            </linearGradient>
            <clipPath id="in-clip"><circle cx="50" cy="50" r="38" /></clipPath>
          </defs>
          <circle cx="50" cy="50" r="43" fill="#ffffff" />
          <circle cx="50" cy="50" r="38" fill="url(#in-globe)" />
          <g clipPath="url(#in-clip)" fill="none" stroke="#ffffff" strokeWidth="2.2" opacity="0.85">
            <ellipse cx="50" cy="50" rx="16" ry="38" />
            <path d="M12 38 C 35 46, 65 46, 88 38" />
            <path d="M12 62 C 35 54, 65 54, 88 62" />
          </g>
          {/* orbit */}
          <ellipse cx="50" cy="50" rx="47" ry="14" fill="none" stroke="#ffffff" strokeWidth="2" opacity="0.6" transform="rotate(-25 50 50)" />
          {/* satellite */}
          <g transform="rotate(-35 50 50)">
            <rect x="14" y="43" width="24" height="14" rx="1.5" fill="url(#in-panel)" stroke="#c98d00" strokeWidth="1.2" />
            <path d="M22 43 V57 M30 43 V57 M14 50 H38" stroke="#c98d00" strokeWidth="1" />
            <rect x="62" y="43" width="24" height="14" rx="1.5" fill="url(#in-panel)" stroke="#c98d00" strokeWidth="1.2" />
            <path d="M70 43 V57 M78 43 V57 M62 50 H86" stroke="#c98d00" strokeWidth="1" />
            <rect x="38" y="48" width="4" height="4" fill="#c98d00" />
            <rect x="58" y="48" width="4" height="4" fill="#c98d00" />
            <rect x="42" y="38" width="16" height="24" rx="3" fill="#ffcc1f" stroke="#c98d00" strokeWidth="1.2" />
            <rect x="45" y="42" width="10" height="5" rx="1" fill="#fff3c2" />
            <path d="M43 38 Q 50 28 57 38 Z" fill="#ffe680" stroke="#c98d00" strokeWidth="1.2" />
            <path d="M50 31 V 25" stroke="#ffffff" strokeWidth="2" strokeLinecap="round" />
            <circle cx="50" cy="24" r="2.2" fill="#ffffff" />
          </g>
        </svg>
      );

    case "settings":
      return (
        <svg viewBox="0 0 100 100" className={cls}>
          <defs>
            <radialGradient id="st-hub" cx="0.4" cy="0.35" r="0.75">
              <stop offset="0" stopColor="#7cc2ff" />
              <stop offset="1" stopColor="#2b82ec" />
            </radialGradient>
          </defs>
          <path d={GEAR} fill="#ffffff" />
          <circle cx="50" cy="50" r="22" fill="url(#st-hub)" />
          <circle cx="50" cy="50" r="12" fill="#ffffff" />
          <circle cx="50" cy="50" r="6" fill="#bfe1ff" />
        </svg>
      );

    case "pvr":
      return (
        <svg viewBox="0 0 100 100" className={cls}>
          <defs>
            <radialGradient id="pv-face" cx="0.4" cy="0.35" r="0.75">
              <stop offset="0" stopColor="#6fe3f7" />
              <stop offset="1" stopColor="#1fa9d6" />
            </radialGradient>
          </defs>
          {/* camera body + lens */}
          <rect x="6" y="24" width="64" height="52" rx="9" fill="#ffffff" />
          <path d="M70 42 L 94 30 V 70 L 70 58 Z" fill="#ffffff" />
          {/* clock */}
          <circle cx="38" cy="50" r="17" fill="url(#pv-face)" />
          <circle cx="38" cy="50" r="17" fill="none" stroke="#e8fbff" strokeWidth="2" />
          <path d="M38 40 V 50 L 45 55" stroke="#ffffff" strokeWidth="3.6" fill="none" strokeLinecap="round" strokeLinejoin="round" />
          {/* REC dot */}
          <circle cx="62" cy="18" r="6" fill="#ff4646" />
          <circle cx="62" cy="18" r="6" fill="none" stroke="#ffffff" strokeWidth="2" />
        </svg>
      );

    case "files":
      return (
        <svg viewBox="0 0 100 100" className={cls}>
          <defs>
            <linearGradient id="fl-front" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#ffffff" />
              <stop offset="1" stopColor="#eafbea" />
            </linearGradient>
          </defs>
          {/* back panel with tab */}
          <path d="M8 26 a6 6 0 0 1 6 -6 h22 l8 8 h42 a6 6 0 0 1 6 6 v44 a6 6 0 0 1 -6 6 H14 a6 6 0 0 1 -6 -6 Z" fill="#d4f7d4" />
          {/* paper sticking out */}
          <rect x="18" y="30" width="62" height="20" rx="2" fill="#ffffff" />
          <rect x="24" y="35" width="30" height="3" rx="1.5" fill="#9de39d" />
          {/* front panel */}
          <path d="M8 42 a5 5 0 0 1 5 -5 h74 a5 5 0 0 1 5 5 l-3 36 a6 6 0 0 1 -6 6 H17 a6 6 0 0 1 -6 -6 Z" fill="url(#fl-front)" />
        </svg>
      );

    case "ca":
      return (
        <svg viewBox="0 0 100 100" className={cls}>
          <defs>
            <linearGradient id="ca-chip" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0" stopColor="#ffe48a" />
              <stop offset="1" stopColor="#d9a300" />
            </linearGradient>
          </defs>
          <rect x="4" y="22" width="92" height="58" rx="7" fill="#ffffff" />
          {/* chip */}
          <rect x="62" y="31" width="22" height="17" rx="3" fill="url(#ca-chip)" stroke="#b88a00" strokeWidth="1" />
          <path d="M62 37 H70 M62 42 H70 M76 37 H84 M76 42 H84 M70 31 V48 M76 31 V48" stroke="#b88a00" strokeWidth="1" />
          {/* text lines */}
          <rect x="12" y="32" width="32" height="4" rx="2" fill="#f2c94c" />
          <rect x="12" y="40" width="22" height="4" rx="2" fill="#f6dc8a" />
          {/* barcode */}
          {Array.from({ length: 22 }).map((_, i) => (
            <rect key={i} x={12 + i * 3.2} y="58" width={i % 4 === 0 ? 2 : i % 3 === 0 ? 1.4 : 0.9} height="13" fill="#4a4a55" />
          ))}
        </svg>
      );
  }
}
