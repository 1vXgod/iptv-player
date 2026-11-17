"use client";
import { useEffect, useState } from "react";
import { clearAllLocalData, type Settings, useStore } from "@/lib/store";
import { GhostButton, Segmented } from "./ui";

/** Browser bars can't be hidden by a web page on iPhone. Installing to the Home Screen is what removes them. */
function InstallCard() {
  const [info, setInfo] = useState<null | { ios: boolean; chromeIos: boolean }>(null);
  useEffect(() => {
    const standalone = window.matchMedia("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
    let dismissed = false;
    try { dismissed = localStorage.getItem("mirax.installHint") === "1"; } catch { /* ignore */ }
    const ua = navigator.userAgent;
    const ios = /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
    if (!standalone && !dismissed) setInfo({ ios, chromeIos: /CriOS/.test(ua) });
  }, []);
  if (!info) return null;
  const dismiss = () => { try { localStorage.setItem("mirax.installHint", "1"); } catch { /* ignore */ } setInfo(null); };
  return (
    <section className="mt-3 rounded-2xl border border-[#16c6f2]/40 bg-[#16c6f2]/10 p-3.5">
      <h3 className="text-[15px] font-semibold text-[#9fe4ff]">Full screen without browser bars</h3>
      {info.ios ? (
        <ol className="mt-2 list-decimal space-y-1 pl-5 text-[13px] leading-relaxed text-white/80">
          <li>
            Open this page in <b className="text-white">Safari</b>
            {info.chromeIos ? " — Chrome on iPhone can't hide its toolbars" : ""}.
          </li>
          <li>Tap <b className="text-white">Share</b>, then <b className="text-white">Add to Home Screen</b>.</li>
          <li>Open <b className="text-white">MiraX</b> from your Home Screen: no address bar or toolbars, and it turns with your phone.</li>
        </ol>
      ) : (
        <p className="mt-2 text-[13px] leading-relaxed text-white/80">
          In Chrome&apos;s menu choose <b className="text-white">Install app</b> (or <b className="text-white">Add to Home screen</b>). It then opens
          without the address bar. The Rotate button also goes full screen and locks landscape.
        </p>
      )}
      <button onClick={dismiss} className="mt-2.5 h-10 rounded-lg bg-white/10 px-4 text-[13px] font-semibold active:bg-white/20">Got it</button>
    </section>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-5">
      <h3 className="mb-2 px-1 text-xs font-semibold uppercase tracking-wider text-white/45">{title}</h3>
      <div className="flex flex-col gap-4 rounded-2xl bg-white/6 p-3.5">{children}</div>
    </section>
  );
}

function Setting({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-2 text-[15px] font-semibold">{label}</div>
      {children}
      {hint && <p className="mt-2 text-xs leading-relaxed text-white/45">{hint}</p>}
    </div>
  );
}

export default function SettingsTab({ say }: { say: (m: string) => void }) {
  const settings = useStore((s) => s.settings);
  const set = (p: Partial<Settings>) => useStore.getState().updateSettings(p);
  const [armed, setArmed] = useState<"order" | "factory" | null>(null);

  useEffect(() => {
    if (!armed) return;
    const id = window.setTimeout(() => setArmed(null), 3000);
    return () => window.clearTimeout(id);
  }, [armed]);

  return (
    <div className="m-scroll h-full overflow-y-auto px-3 pb-8 pt-1">
      <InstallCard />
      <Section title="Playback">
        <Setting label="Stream conversion" hint="Automatic converts raw TV streams to a clean 720p picture with AAC sound whenever the server has ffmpeg (this stops green lines and missing sound on phones), and leaves other channels alone. “Always” converts every channel. “Off” never converts.">
          <Segmented<Settings["transcode"]> value={settings.transcode} onChange={(v) => set({ transcode: v })}
            options={[{ value: "auto", label: "Automatic" }, { value: "always", label: "Always" }, { value: "off", label: "Off" }]} />
        </Setting>
        <Setting label="Audio processing" hint="If sound drops out or crackles on some channels, choose “Via ffmpeg” to rebuild every channel's audio as clean AAC.">
          <Segmented<Settings["audioFix"]> value={settings.audioFix} onChange={(v) => set({ audioFix: v })}
            options={[{ value: "auto", label: "Automatic" }, { value: "always", label: "Via ffmpeg" }]} />
        </Setting>
      </Section>

      <Section title="Interface">
        <Setting label="Layout" hint="Auto shows this phone layout on phones and tablets, and the TV layout (keyboard controls) on a computer. You can also add ?ui=phone or ?ui=tv to the address.">
          <Segmented<Settings["ui"]> value={settings.ui} onChange={(v) => set({ ui: v })}
            options={[{ value: "auto", label: "Auto" }, { value: "phone", label: "Phone" }, { value: "tv", label: "TV" }]} />
        </Setting>
      </Section>

      <Section title="Maintenance">
        <GhostButton
          onClick={() => {
            if (armed !== "order") { setArmed("order"); return; }
            setArmed(null);
            useStore.getState().resetOrder();
            say("Channel order restored");
          }}
          danger={armed === "order"}
        >
          {armed === "order" ? "Tap again to confirm" : "Reset channel order"}
        </GhostButton>
        <GhostButton onClick={() => { try { localStorage.removeItem("mirax.strategy"); } catch { /* ignore */ } say("Learned stream methods cleared"); }}>
          Forget learned stream methods
        </GhostButton>
        <GhostButton
          danger
          onClick={() => {
            if (armed !== "factory") { setArmed("factory"); return; }
            clearAllLocalData();
            window.location.reload();
          }}
        >
          {armed === "factory" ? "Tap again — this erases everything" : "Factory reset"}
        </GhostButton>
      </Section>

      <p className="mt-6 text-center text-xs text-white/30">MiraX IPTV Player</p>
    </div>
  );
}
