"use client";
import { useEffect, useState } from "react";
import { useStore } from "./store";

export type UiMode = "phone" | "tv";

/**
 * Which interface to show.
 *  1. ?ui=phone or ?ui=tv in the URL (handy for testing)
 *  2. the "Interface" setting, when it isn't Auto
 *  3. auto-detect: a touch-first device (primary pointer is a finger, nothing can hover) is a
 *     phone/tablet and gets the phone UI; a PC (mouse + keyboard) gets the TV UI.
 * Returns null until the browser has been inspected, so the wrong UI never flashes.
 */
export function useUiMode(): UiMode | null {
  const hydrated = useStore((s) => s.hydrated);
  const pref = useStore((s) => s.settings.ui);
  const [touchFirst, setTouchFirst] = useState<boolean | null>(null);

  useEffect(() => {
    const coarse = window.matchMedia("(pointer: coarse)");
    const noHover = window.matchMedia("(hover: none)");
    const update = () => setTouchFirst(coarse.matches && noHover.matches);
    update();
    coarse.addEventListener("change", update);
    noHover.addEventListener("change", update);
    return () => {
      coarse.removeEventListener("change", update);
      noHover.removeEventListener("change", update);
    };
  }, []);

  if (!hydrated || touchFirst === null) return null;
  const q = new URLSearchParams(window.location.search).get("ui");
  if (q === "phone" || q === "tv") return q;
  if (pref === "phone" || pref === "tv") return pref;
  return touchFirst ? "phone" : "tv";
}
