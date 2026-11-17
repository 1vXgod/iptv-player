"use client";
import { useEffect } from "react";
import { Icon } from "./icons";

/** Bottom sheet (forms) or right-hand drawer (channel list in fullscreen). */
export function Sheet({ open, onClose, side = "bottom", title, children }: {
  open: boolean; onClose: () => void; side?: "bottom" | "right"; title?: string; children: React.ReactNode;
}) {
  useEffect(() => {
    if (!open) return;
    const on = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", on);
    return () => window.removeEventListener("keydown", on);
  }, [open, onClose]);
  if (!open) return null;
  const bottom = side === "bottom";
  return (
    <div className="pointer-events-auto fixed inset-0 z-[60]" role="dialog" aria-modal data-no-gesture>
      <div className="mx-fade-in absolute inset-0 bg-black/65" onClick={onClose} />
      <div
        className={`absolute flex flex-col bg-[#0d1428] text-white shadow-2xl ${
          bottom ? "m-sheet-up inset-x-0 bottom-0 max-h-[88dvh] rounded-t-2xl border-t border-white/10" : "m-sheet-left inset-y-0 right-0 w-[min(88vw,420px)] border-l border-white/10"
        }`}
        style={{ paddingBottom: bottom ? "env(safe-area-inset-bottom)" : undefined, paddingTop: bottom ? undefined : "env(safe-area-inset-top)" }}
      >
        <div className="flex shrink-0 items-center justify-between px-4 pb-2 pt-3">
          {bottom && <div className="absolute left-1/2 top-1.5 h-1 w-10 -translate-x-1/2 rounded-full bg-white/25" />}
          <h2 className="text-base font-semibold">{title}</h2>
          <button onClick={onClose} aria-label="Close" className="flex h-10 w-10 items-center justify-center rounded-full text-white/70 active:bg-white/10">
            <Icon name="x" className="h-5 w-5" />
          </button>
        </div>
        <div className="m-scroll min-h-0 flex-1 overflow-y-auto">{children}</div>
      </div>
    </div>
  );
}

export function Segmented<T extends string | number | boolean>({ value, options, onChange }: {
  value: T; options: { value: T; label: string }[]; onChange: (v: T) => void;
}) {
  return (
    <div className="flex rounded-xl bg-white/8 p-1" role="radiogroup">
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={String(o.value)}
            role="radio"
            aria-checked={active}
            onClick={() => onChange(o.value)}
            className={`min-h-10 flex-1 rounded-lg px-2 text-[13px] font-semibold transition-colors ${active ? "bg-[#16c6f2] text-[#062033]" : "text-white/75 active:bg-white/10"}`}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

export const field =
  "h-12 w-full rounded-xl border border-white/15 bg-[#0a1020] px-3.5 text-base text-white outline-none placeholder:text-white/35 focus:border-[#16c6f2]";

export function PrimaryButton({ children, onClick, disabled, className = "" }: {
  children: React.ReactNode; onClick?: () => void; disabled?: boolean; className?: string;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`flex h-12 items-center justify-center gap-2 rounded-xl bg-[#16c6f2] px-5 text-[15px] font-semibold text-[#062033] transition-opacity active:opacity-80 disabled:opacity-50 ${className}`}
    >
      {children}
    </button>
  );
}

export function GhostButton({ children, onClick, className = "", danger = false }: {
  children: React.ReactNode; onClick?: () => void; className?: string; danger?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex h-12 items-center justify-center gap-2 rounded-xl border px-5 text-[15px] font-semibold transition-colors active:bg-white/10 ${
        danger ? "border-red-400/40 text-red-300" : "border-white/15 text-white"
      } ${className}`}
    >
      {children}
    </button>
  );
}
