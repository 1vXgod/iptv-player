"use client";
import { useEffect } from "react";
import { useStore } from "@/lib/store";
import { useUiMode } from "@/lib/ui-mode";
import MobileApp from "./mobile/MobileApp";
import Receiver from "./Receiver";

/** Picks the interface for this device: phone layout on touch devices, the TV layout (keyboard) on a PC. */
export default function Root() {
  const mode = useUiMode();
  useEffect(() => { useStore.getState().hydrate(); }, []);
  if (!mode) return <div className="h-dvh w-screen bg-black" />; // inspecting the device — avoids flashing the wrong UI
  return mode === "phone" ? <MobileApp /> : <Receiver />;
}
