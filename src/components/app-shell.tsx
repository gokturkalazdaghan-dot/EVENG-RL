import { CaptureGuard } from "@/components/capture-guard";
import { CreateSheet } from "@/components/create-sheet";
import { CrystalMark } from "@/components/crystal-mark";
import { DragStrip } from "@/components/drag-strip";
import { EdgeMenu } from "@/components/edge-menu";
import { FeedbackSheet } from "@/components/feedback-sheet";
import { EffectsScreen } from "@/components/effects-screen";
import { GenerateScreen } from "@/components/generate-screen";
import { LegalGate } from "@/components/legal-gate";
import { PaywallSheet } from "@/components/paywall-sheet";
import { PlayStoreSheet } from "@/components/play-store-sheet";
import { ProjectsScreen } from "@/components/projects-screen";
import { SettingsScreen } from "@/components/settings-screen";
import { SoftNoteHost } from "@/components/soft-note";
import { SplashScreen } from "@/components/splash-screen";
import { StorageScreen } from "@/components/storage-screen";
import { StudioScreen } from "@/components/studio-screen";
import { ToolsScreen } from "@/components/tools-screen";
import { OracleScreen } from "@/components/oracle-screen";
import { bootLocale, useT } from "@/lib/i18n";
import { useFastTap } from "@/lib/fast-tap";
import { useKeyboardInset } from "@/lib/keyboard";
import { useParallax } from "@/lib/parallax";
import { loadOracleJob, pingOracleReady, remainMs, saveOracleJob } from "@/lib/oracle-job";
import { cameFromPlay, isNativeApp, isStandalone } from "@/lib/play-store";
import { isPro, useApp } from "@/lib/store";
import type { CrystalId, TabId } from "@/lib/types";
import { cn, moveItem } from "@/lib/utils";
import { Brush, Coffee, Folder, Layers, Settings, Sparkles, Wand2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

const TAB_META: Record<
  Exclude<TabId, "storage" | "feed">,
  { labelKey: "nav_projects" | "nav_generate" | "nav_settings" | "nav_studio" | "nav_effects" | "nav_tools" | "nav_oracle"; icon: typeof Folder; hero?: boolean }
> = {
  projects: { labelKey: "nav_projects", icon: Folder },
  studio: { labelKey: "nav_studio", icon: Layers, hero: true },
  effects: { labelKey: "nav_effects", icon: Sparkles },
  generate: { labelKey: "nav_generate", icon: Wand2 },
  oracle: { labelKey: "nav_oracle", icon: Coffee },
  tools: { labelKey: "nav_tools", icon: Brush },
  settings: { labelKey: "nav_settings", icon: Settings },
};

export function AppShell() {
  const t = useT();
  useKeyboardInset();
  useParallax();
  const tab = useApp((s) => s.tab);
  const setTab = useApp((s) => s.setTab);
  const setAtelier = useApp((s) => s.setAtelier);
  const hydrate = useApp((s) => s.hydrate);
  const toast = useApp((s) => s.toast);
  const legalOpen = useApp((s) => s.legalOpen);
  const proUntil = useApp((s) => s.proUntil);
  const crystalId = useApp((s) => s.crystalId as CrystalId | null);
  const navOrder = useApp((s) => s.navOrder as TabId[]);
  const setNavOrder = useApp((s) => s.setNavOrder);

  const tabs = useMemo(
    () =>
      (Array.isArray(navOrder) ? navOrder : Object.keys(TAB_META)).filter(
        (id): id is Exclude<TabId, "storage" | "feed"> => id in TAB_META,
      ),
    [navOrder],
  );

  const [splash, setSplash] = useState(false);
  const [playMode, setPlayMode] = useState<"prompt" | "listing" | null>(null);
  const [paywall, setPaywall] = useState(false);
  const [feedback, setFeedback] = useState(false);
  const [navReady, setNavReady] = useState(true);
  const [slip, setSlip] = useState<"left" | "right">("right");
  const prevTab = useRef(tab);

  useEffect(() => {
    const from = tabs.indexOf(prevTab.current as (typeof tabs)[number]);
    const to = tabs.indexOf(tab as (typeof tabs)[number]);
    if (from >= 0 && to >= 0 && from !== to) setSlip(to > from ? "right" : "left");
    prevTab.current = tab;
  }, [tab, tabs]);

  useEffect(() => {
    bootLocale();
    hydrate();
    // Play'deki satın almayı HER AÇILIŞTA oku. localStorage silinebilir
    // (yeniden kurulum, yeni telefon, veri temizleme) ama abonelik Play'de
    // durur. Bu çağrı olmadan ödeyen kullanıcı PRO'sunu kaybeder ve haklı
    // olarak iade ister. Play'in söylediği yereldekinden üstündür: iptal
    // ya da iade durumunda yerel damgayı da düşürür.
    useApp.getState().restorePro();
    setNavReady(true);
    ["/media/seer/coffee.jpg", "/media/seer/palm.jpg", "/media/seer/dream.jpg"].forEach((src) => {
      const img = new Image();
      img.src = src;
    });
  }, [hydrate]);

  const finishSplash = useCallback(() => {
    hydrate();
    setSplash(false);
    if (typeof window === "undefined") return;
    const q = new URLSearchParams(window.location.search);
    const sku = q.get("sku");
    const wantPlay = q.get("play") === "1" || q.get("store") === "1";
    const wantReview = q.get("review") === "1";
    const wantPay = q.get("paywall") === "1" || Boolean(sku);
    const wantFb = q.get("feedback") === "1";
    const fromPlay = cameFromPlay();
    const standalone = isStandalone();
    const native = isNativeApp();
    const s = useApp.getState();

    if (native) {
      s.markNativeInstalled();
    } else if (fromPlay || standalone) {
      s.dismissPlayPrompt();
    }

    if (wantFb) {
      setFeedback(true);
      return;
    }
    if (!s.legalAccepted) return;
    if (wantPay) {
      setPaywall(true);
      return;
    }
    if (wantPlay || wantReview) {
      setPlayMode("listing");
    }
  }, [hydrate]);

  useEffect(() => {
    function onOpenPlay() {
      setPlayMode("listing");
    }
    function onOpenPaywall() {
      setPaywall(true);
    }
    function onOpenFeedback() {
      setFeedback(true);
    }
    window.addEventListener("even:play", onOpenPlay);
    window.addEventListener("even:paywall", onOpenPaywall);
    window.addEventListener("even:feedback", onOpenFeedback);
    return () => {
      window.removeEventListener("even:play", onOpenPlay);
      window.removeEventListener("even:paywall", onOpenPaywall);
      window.removeEventListener("even:feedback", onOpenFeedback);
    };
  }, []);

  useEffect(() => {
    function fire() {
      const job = loadOracleJob();
      if (!job || job.notified) return;
      if (remainMs(job) > 0) return;
      if (job.status !== "ready") return;
      saveOracleJob({ ...job, notified: true });
      pingOracleReady(t("fal_ready_title"), t("fal_ready_body"));
      useApp.getState().flash(t("fal_ready_body"));
    }
    const id = window.setInterval(fire, 2000);
    window.addEventListener("even:oracle-ready", fire);
    fire();
    return () => {
      window.clearInterval(id);
      window.removeEventListener("even:oracle-ready", fire);
    };
  }, [t]);

  const chromeHidden = playMode !== null || paywall || feedback;
  const navOn = navReady && !legalOpen && !chromeHidden;

  return (
    <div className="phone-shell text-fg" style={{ background: "#fff" }}>
      <div className="phone-frame grain overflow-hidden">
        <main
          className={cn(
            "app-body",
            tab === "studio" && !chromeHidden && "is-studio",
            tab === "tools" && !chromeHidden && "is-tools",
            tab === "oracle" && !chromeHidden && "is-oracle",
            chromeHidden && "hidden",
          )}
        >
          <div key={tab} className={cn("app-center slip", slip === "left" && "from-left")}>
            {tab === "projects" ? <ProjectsScreen /> : null}
            {tab === "studio" ? <StudioScreen /> : null}
            {tab === "effects" ? <EffectsScreen /> : null}
            {tab === "generate" ? <GenerateScreen /> : null}
            {tab === "oracle" ? <OracleScreen /> : null}
            {tab === "tools" ? <ToolsScreen /> : null}
            {tab === "storage" ? <StorageScreen /> : null}
            {tab === "settings" ? <SettingsScreen /> : null}
          </div>
        </main>

        {legalOpen ? null : <CaptureGuard />}
        {legalOpen ? null : <EdgeMenu />}
        <CreateSheet />
        <SoftNoteHost />

        {feedback ? <FeedbackSheet open={feedback} onClose={() => setFeedback(false)} /> : null}

        {toast ? (
          <div className="pointer-events-none absolute inset-x-5 top-[max(2.6rem,calc(env(safe-area-inset-top)+0.35rem))] z-[85]">
            <div className="panel-elevated rounded-2xl px-4 py-3 text-center text-sm font-medium shadow-[0_12px_32px_rgb(0_0_0/0.35)]">
              {toast}
            </div>
          </div>
        ) : null}

        <LegalGate />

        {paywall && !legalOpen ? <PaywallSheet onClose={() => setPaywall(false)} /> : null}

        {playMode && !legalOpen ? (
          <PlayStoreSheet
            mode={playMode}
            onClose={() => setPlayMode(null)}
            onOpenPaywall={() => {
              setPlayMode(null);
              setPaywall(true);
            }}
            onShowListing={() => setPlayMode("listing")}
          />
        ) : null}

        {splash ? <SplashScreen onDone={finishSplash} /> : null}

        {navOn ? (
          <nav className="app-nav" aria-label="Ana menü">
            <DragStrip
              className="nav-bar"
              onReorder={(from, to) => setNavOrder(moveItem(tabs, from, to))}
            >
              {tabs.map((id, i) => (
                  <NavOrb
                    key={id}
                    id={id}
                    i={i}
                    active={tab === id}
                    crystalId={crystalId}
                    proUntil={proUntil}
                    onGo={() => {
                      try {
                        navigator.vibrate?.(10);
                      } catch {
                        /* ignore */
                      }
                      setTab(id);
                      if (id === "studio") setAtelier("even");
                    }}
                  />
                ))}
            </DragStrip>
          </nav>
        ) : null}
      </div>
    </div>
  );
}

function NavOrb({
  id,
  i,
  active,
  crystalId,
  proUntil,
  onGo,
}: {
  id: Exclude<TabId, "storage" | "feed">;
  i: number;
  active: boolean;
  crystalId: CrystalId | null;
  proUntil: number;
  onGo: () => void;
}) {
  const t = useT();
  const item = TAB_META[id];
  const Icon = item.icon;
  const tap = useFastTap(onGo);
  return (
    <button
      type="button"
      data-drag-i={i}
      aria-label={t(item.labelKey)}
      aria-current={active ? "page" : undefined}
      className={cn("nav-orb", "azure", active && "on", item.hero && "hero")}
      {...tap}
    >
      <span className="nav-gem">
        {id === "settings" && crystalId === "girl" && isPro(proUntil) ? (
          <CrystalMark id="girl" size="xs" />
        ) : (
          <Icon className={item.hero ? "size-6" : "size-5"} strokeWidth={2.2} />
        )}
      </span>
      <span className="nav-orb-label">{t(item.labelKey)}</span>
    </button>
  );
}
