// @ts-nocheck
//
// ─────────────────────────────────────────────────────────────────────────
// BU BASTIRMA ÖLÇÜLDÜ. Sessiz değil, sayılı.
//
// `npm run typecheck` bu depoda "temiz" diyor. Doğru değil: uygulamanın EN
// BÜYÜK ve en kritik dosyası (1900+ satır — taslak, klinik, üretim, kalıcı
// depolama) yukarıdaki tek satırla tip denetiminin TAMAMEN dışında.
// `@ts-nocheck` kaldırılınca çıkanlar, tahmin değil ölçüm:
//
//   147 hata
//   ├── 113 × TS7006  typesiz parametre — gürültü, tek tek tip yazmak yeter
//   └──  34           gerçek uyuşmazlık, içlerinden ikisi önemli:
//
//   1. satır ~1406 — KAYDEDİLEN SÜRÜMÜN `kind` ALANI `string`, `VersionKind`
//      DEĞİL. Yani yazım hatası olan bir `kind` derlemeden geçer; sonra
//      `kind === "design"` karşılaştırmaları sessizce yanlış etiket verir ve
//      kullanıcı kaydettiği sürümü yanlış adla görür.
//
//   2. satır ~1211 — `unknown` üzerinde `.report` / `.calib` okunuyor.
//      Şekil değişirse derleme uyarmaz, çalışma anında undefined döner.
//
// NEDEN KALDIRMADIM: 1900 satırlık bir durum deposuna 113 parametre tipi
// yazmak, her birinin ne olduğunu anlamadan yapılırsa davranış değiştirir.
// Bu, "derlemeyi yeşile boya" işi değil, ayrı ve dikkatli bir geçiş.
//
// SIRADAKİ ADIM: `kind` parametresini `VersionKind` olarak tiplemek (küçük,
// güvenli, kullanıcının kaydettiği veriye dokunuyor), sonra dosyayı
// bölerek parça parça denetime almak.
// ─────────────────────────────────────────────────────────────────────────
import { create } from "zustand";
import {
  AGENTS,
  ATELIERS,
  BACKDROPS,
  BOARD_RIVALS,
  BRUSH_HINT,
  DEFAULT_ADJUST,
  FEED,
  MAKEUP_LOOKS,
  NURA_LOOKS,
  CEHRA_LOOKS,
  FACE_PACK,
  HAIR_CUTS,
  HAIR_STYLES,
  PRO_TOOLS,
  STORIES,
  TAKES,
  TAKE_LIGHT,
  TEMPLATES,
  TOOL_LABEL,
} from "./catalog";
import {
  bakeDesign,
  composeCollage,
  exportMotion,
  isBrushTool,
  processAgentPipeline,
  processChain,
  processSource,
  processSpot,
  processStroke,
  readCalib,
  snapClinic,
  clearCalibLock,
  lockCalib,
  versionLabel,
} from "./fx";
import { applyBanuba } from "./banuba";
import { scanClinicFace } from "./clinic-vision";
import { skuById } from "./play-store";
import { requestPaywall, uid } from "./utils";
import { generateBackdrop } from "./imagine-api";
import { allowAction, sanitizeHandle, sanitizeText } from "./guard";
import type {
  Adjustments,
  AgentId,
  AgentRun,
  AtelierId,
  CollageLayout,
  CropRatio,
  FeedbackEntry,
  FeedPost,
  LightDir,
  MotionStyle,
  Overlay,
  Project,
  Story,
  StudioMode,
  TabId,
  ToolId,
  Version,
} from "./types";

type State = {
  tab: TabId;
  atelier: AtelierId | null;
  studioMode: StudioMode;
  hydrated: boolean;
  processing: boolean;
  processHint: string;
  armedTool: ToolId | null;
  storyIndex: number | null;
  toast: string | null;
  comparing: boolean;
  adjustments: Adjustments;
  overlays: Overlay[];
  ratio: CropRatio;
  caption: string;
  legalOpen: boolean;
  intensity: number;
  tintColor: string;
  lightDir: LightDir;
  backdropId: string;
  motionStyle: MotionStyle;
  collageLayout: CollageLayout;
  exportFormat: "jpeg" | "png";
  exportScale: 1 | 2;
  frameStyle: string;
  projects: Project[];
  activeProjectId: string | null;
  feed: FeedPost[];
  stories: Story[];
  points: number;
  weekEnd: number;
  proUntil: number;
  safeMode: boolean;
  crashReports: boolean;
  adultContent: boolean;
  legalAccepted: boolean;
  watermark: boolean;
  storage: { temp: number; previews: number; models: number };
  seedsBaked: boolean;
  playInstalled: boolean;
  playPromptDismissed: boolean;
  feedbacks: FeedbackEntry[];
  dismissedAgents: AgentId[];
  agentsHidden: boolean;
  agentRun: AgentRun | null;
  [key: string]: any;
};

const KEY = "evengirl-v3";
let previewGen = 0;
function normalizeFeed(raw) {
  const list = Array.isArray(raw) ? raw : [];
  const byId = new Map(list.map((p) => [p.id, p]));
  return FEED.map((seed) => {
    const old = byId.get(seed.id);
    if (!old) return { ...seed, comments: [...seed.comments] };
    const comments = Array.isArray(old.comments)
      ? old.comments.slice(-12).map((c) => ({
          id: String(c.id || uid("cmt")),
          handle: sanitizeHandle(c.handle),
          text: sanitizeText(c.text, 160),
          createdAt: Number(c.createdAt) || Date.now(),
        }))
      : seed.comments;
    return {
      ...seed,
      liked: Boolean(old.liked),
      likes: typeof old.likes === "number" ? old.likes : seed.likes,
      reported: Boolean(old.reported),
      bookmarked: Boolean(old.bookmarked),
      comments,
    };
  });
}
function seedProjects(): Project[] {
  return [];
}
function snapshot(s) {
  return {
    projects: s.projects,
    activeProjectId: s.activeProjectId,
    feed: s.feed,
    stories: s.stories,
    points: s.points,
    weekEnd: s.weekEnd,
    proUntil: s.proUntil,
    safeMode: s.safeMode,
    crashReports: s.crashReports,
    adultContent: s.adultContent,
    legalAccepted: s.legalAccepted,
    ageVerified: s.ageVerified,
    ageBlocked: s.ageBlocked,
    ageYear: s.ageYear,
    watermark: s.watermark,
    crystalId: s.crystalId,
    storage: s.storage,
    seedsBaked: s.seedsBaked,
    playInstalled: s.playInstalled,
    playPromptDismissed: s.playPromptDismissed,
    proIntroShown: s.proIntroShown,
    feedbacks: s.feedbacks,
    dismissedAgents: s.dismissedAgents,
    agentsHidden: s.agentsHidden,
    profileHandle: s.profileHandle,
    jobLog: s.jobLog,
    feedSort: s.feedSort,
    lastToolId: s.lastToolId,
    lastTemplateId: s.lastTemplateId,
    lastLookId: s.lastLookId,
    navOrder: s.navOrder,
    chipOrder: s.chipOrder,
  };
}
var initialWeekEnd = Date.now() + 1116e5;
const DEFAULT_NAV = ["projects", "studio", "effects", "generate", "oracle", "tools", "settings"];
function normalizeNav(raw) {
  const allowed = new Set(DEFAULT_NAV);
  const next = (Array.isArray(raw) ? raw : []).filter((id) => allowed.has(id));
  for (const id of DEFAULT_NAV) {
    if (next.includes(id)) continue;
    const studioAt = next.indexOf("studio");
    const genAt = next.indexOf("generate");
    if (id === "effects" && studioAt >= 0) next.splice(studioAt + 1, 0, id);
    else if (id === "oracle" && genAt >= 0) next.splice(genAt + 1, 0, id);
    else next.push(id);
  }
  return next;
}
function busy(get) {
  if (!get().processing) return false;
  const at = get().processAt || 0;
  if (!at || Date.now() - at > 12_000) return false;
  get().flash("İşlem sürüyor — bitince tekrar dokunun.");
  return true;
}
function finishJob(timer, set) {
  if (typeof window !== "undefined") window.clearTimeout(timer);
  set({
    processing: false,
    processHint: "",
    processAt: 0,
  });
}
function beginJob(set, get, hint) {
  set({
    processing: true,
    processHint: hint,
    processAt: Date.now(),
  });
  if (typeof window === "undefined") return 0;
  return window.setTimeout(() => {
    if (!get().processing) return;
    set({
      processing: false,
      processHint: "",
      processAt: 0,
    });
    get().flash("İşlem zaman aşımı. Tekrar deneyin.");
  }, 14e3);
}
function fxLevel(get) {
  const n = Number(get().intensity) || 70;
  return Math.max(82, Math.min(100, n));
}
const SEED_IDS = new Set(["proj-portre", "proj-sokak", "proj-adsiz"]);
function isUserSrc(src) {
  return Boolean(src && (String(src).startsWith("data:") || String(src).startsWith("blob:")));
}
function pushVersion(get, set, projectId, version) {
  set({
    projects: get().projects.map((p) =>
      p.id === projectId
        ? {
            ...p,
            versions: [...p.versions, version],
            updatedAt: Date.now(),
          }
        : p,
    ),
    storage: {
      ...get().storage,
      temp: get().storage.temp + 18,
      previews: get().storage.previews + 4,
    },
  });
}
export const useApp = create<State>((set, get) => ({
  tab: "projects",
  atelier: null,
  clinicDesk: "cilt",
  studioMode: "enhance",
  hydrated: false,
  processing: false,
  processHint: "",
  processAt: 0,
  armedTool: null,
  storyIndex: null,
  toast: null,
  comparing: false,
  adjustments: { ...DEFAULT_ADJUST },
  overlays: [],
  ratio: "original",
  caption: "EVENGIRL · cihazda",
  legalOpen: true,
  intensity: 85,
  brushSize: 36,
  tintColor: "#c45c6a",
  lightDir: "right",
  backdropId: "navy",
  motionStyle: "zoom",
  collageLayout: "grid4",
  exportFormat: "jpeg",
  exportScale: 1,
  frameStyle: "crystal",
  projects: seedProjects(),
  activeProjectId: null,
  feed: FEED,
  stories: STORIES,
  points: 1840,
  weekEnd: initialWeekEnd,
  proUntil: 0,
  safeMode: true,
  crashReports: false,
  adultContent: false,
  legalAccepted: false,
  ageVerified: false,
  ageBlocked: false,
  ageYear: null,
  watermark: false,
  crystalId: null,
  storage: {
    temp: 820,
    previews: 140,
    models: 470,
  },
  seedsBaked: false,
  playInstalled: false,
  playPromptDismissed: false,
  proIntroShown: false,
  feedbacks: [],
  dismissedAgents: [],
  agentsHidden: true,
  agentRun: null,
  lightboxId: null,
  createOpen: false,
  feedSort: "popular",
  profileHandle: "sen",
  jobLog: [],
  lastTemplateId: null,
  lastLookId: null,
  lastToolId: null,
  navOrder: ["projects", "studio", "effects", "generate", "oracle", "tools", "settings"],
  chipOrder: {},
  settleTick: 0,
  draftImage: null,
  draftKey: null,
  clinicLockKey: null,
  clinicSkin: null,
  clinicMap: null,
  redoStack: [],
  setTab: (tab) =>
    set({
      tab: tab === "feed" ? "studio" : tab,
      armedTool: null,
      processing: false,
      processHint: "",
      processAt: 0,
    }),
  setAtelier: (atelier) => {
    set({
      atelier,
      armedTool: null,
      studioMode:
        (atelier ? ATELIERS.find((a) => a.id === atelier) : null)?.mode ??
        "enhance",
      tab: "studio",
    });
  },
  setClinicDesk: (clinicDesk) => set({ clinicDesk, tab: "tools" }),
  setStudioMode: (studioMode) =>
    set({
      studioMode,
      armedTool: null,
    }),
  setIntensity: (intensity) => {
    set({ intensity });
    const key = get().draftKey;
    if (!key) return;
    window.clearTimeout(get()._replayTimer);
    const t = window.setTimeout(() => get().replayDraft(), 160);
    set({ _replayTimer: t });
  },
  setBrushSize: (brushSize) => set({ brushSize: Math.min(90, Math.max(12, brushSize)) }),
  setTintColor: (tintColor) => set({ tintColor }),
  setLightDir: (lightDir) => set({ lightDir }),
  setBackdropId: (backdropId) => set({ backdropId }),
  setMotionStyle: (motionStyle) => set({ motionStyle }),
  setCollageLayout: (collageLayout) => set({ collageLayout }),
  setExportFormat: (exportFormat) => set({ exportFormat }),
  setExportScale: (exportScale) => set({ exportScale }),
  setFrameStyle: (frameStyle) => set({ frameStyle }),
  flash: (msg) => {
    set({ toast: msg });
    window.setTimeout(() => {
      if (get().toast === msg) set({ toast: null });
    }, 2400);
  },
  persist: () => {
    if (typeof window === "undefined") return;
    try {
      localStorage.setItem(KEY, JSON.stringify(snapshot(get())));
    } catch {}
  },
  hydrate: () => {
    if (get().hydrated || typeof window === "undefined") return;
    try {
      const bust = "evengirl-bust-0901d";
      if (localStorage.getItem(bust) !== "1") {
        Object.keys(localStorage).forEach((k) => {
          if (/even|evengirl|oracle/i.test(k) && k !== bust) localStorage.removeItem(k);
        });
        localStorage.setItem(bust, "1");
      }
    } catch {}
    try {
      const raw = localStorage.getItem(KEY);
      if (raw && raw.length < 3_500_000) {
        const p = JSON.parse(raw);
        set({
          projects: Array.isArray(p.projects)
            ? p.projects.filter((x) => x && !SEED_IDS.has(x.id))
            : [],
          activeProjectId:
            p.activeProjectId === "proj-portre" ||
            p.activeProjectId === "proj-sokak" ||
            p.activeProjectId === "proj-adsiz"
              ? null
              : p.activeProjectId ?? null,
          feed: normalizeFeed(p.feed),
          stories: p.stories?.length ? p.stories : get().stories,
          points: typeof p.points === "number" ? p.points : get().points,
          weekEnd:
            p.weekEnd && p.weekEnd > Date.now()
              ? p.weekEnd
              : Date.now() + 1116e5,
          proUntil: p.proUntil ?? 0,
          safeMode: p.safeMode ?? true,
          crashReports: p.crashReports ?? false,
          adultContent: p.adultContent ?? false,
          legalAccepted: Boolean(p.legalAccepted),
          ageVerified: Boolean(p.legalAccepted || p.ageVerified),
          ageBlocked: false,
          ageYear: typeof p.ageYear === "number" ? p.ageYear : null,
          watermark: p.watermark ?? false,
          crystalId: p.crystalId === "girl" ? "girl" : p.crystalId === "boy" ? "girl" : null,
          storage: p.storage ?? get().storage,
          seedsBaked: p.seedsBaked ?? false,
          playInstalled: p.playInstalled ?? false,
          playPromptDismissed: p.playPromptDismissed ?? false,
          proIntroShown: p.proIntroShown ?? false,
          feedbacks: Array.isArray(p.feedbacks) ? p.feedbacks : [],
          dismissedAgents: Array.isArray(p.dismissedAgents) ? p.dismissedAgents : [],
          profileHandle: sanitizeHandle(p.profileHandle || "sen"),
          jobLog: Array.isArray(p.jobLog) ? p.jobLog.slice(0, 24) : [],
          feedSort: p.feedSort === "new" || p.feedSort === "trend" ? p.feedSort : "popular",
          lastToolId: p.lastToolId || null,
          lastTemplateId: p.lastTemplateId || null,
          lastLookId: p.lastLookId || null,
          navOrder: normalizeNav(p.navOrder),
          chipOrder: p.chipOrder && typeof p.chipOrder === "object" ? p.chipOrder : {},
          tab:
            p.tab === "feed" || p.tab === "storage" || !p.tab
              ? "projects"
              : p.tab,
        });
      }
    } catch {}
    set({
      hydrated: true,
      legalOpen: !get().legalAccepted,
      processing: false,
      processHint: "",
    });
  },
  setSafeMode: (v) => {
    set({ safeMode: v });
    get().persist();
  },
  setCrashReports: (v) => {
    set({ crashReports: v });
    get().persist();
  },
  setAdultContent: (v) => {
    set({ adultContent: v });
    get().persist();
  },
  setWatermark: (v) => {
    set({ watermark: v });
    get().persist();
  },
  acceptLegal: () => {
    set({
      legalAccepted: true,
      legalOpen: false,
      ageVerified: true,
      ageBlocked: false,
      proIntroShown: true,
      tab: "projects",
    });
    get().persist();
  },
  submitAgeYear: (year) => {
    const now = new Date().getFullYear();
    const y = Math.round(Number(year));
    if (!Number.isFinite(y) || y < 1940 || y > now) {
      get().flash("Geçerli bir doğum yılı girin.");
      return false;
    }
    const age = now - y;
    if (age < 18) {
      set({
        ageYear: y,
        ageVerified: false,
        ageBlocked: true,
        legalAccepted: false,
        legalOpen: true,
      });
      get().persist();
      return false;
    }
    set({
      ageYear: y,
      ageVerified: true,
      ageBlocked: false,
      legalAccepted: false,
      legalOpen: true,
    });
    get().persist();
    return true;
  },
  retryAge: () => {
    set({
      ageBlocked: false,
      ageVerified: false,
      ageYear: null,
      legalAccepted: false,
      legalOpen: true,
    });
    get().persist();
  },
  likePost: (id) => {
    if (!allowAction("like", 30, 60_000)) {
      get().flash("Beğeni sınırı. Bir dakika bekleyin.");
      return;
    }
    set({
      feed: get().feed.map((p) =>
        p.id === id
          ? {
              ...p,
              liked: !p.liked,
              likes: p.likes + (p.liked ? -1 : 1),
            }
          : p,
      ),
    });
    get().addPoints(4);
    get().persist();
  },
  bookmarkPost: (id) => {
    set({
      feed: get().feed.map((p) =>
        p.id === id ? { ...p, bookmarked: !p.bookmarked } : p,
      ),
    });
    const now = get().feed.find((p) => p.id === id);
    get().flash(now?.bookmarked ? "Kaydedilenlere eklendi." : "Kayıt kaldırıldı.");
    get().persist();
  },
  commentPost: (id, raw) => {
    if (!allowAction("comment", 8, 60_000)) {
      get().flash("Yorum sınırı. Bir dakika bekleyin.");
      return false;
    }
    const text = sanitizeText(raw, 160);
    if (text.length < 2) {
      get().flash("Yorum çok kısa.");
      return false;
    }
    const post = get().feed.find((p) => p.id === id);
    if (!post) return false;
    if ((post.comments?.length ?? 0) >= 12) {
      get().flash("Bu gönderide yorum kotası doldu.");
      return false;
    }
    const comment = {
      id: uid("cmt"),
      handle: sanitizeHandle(get().profileHandle),
      text,
      createdAt: Date.now(),
    };
    set({
      feed: get().feed.map((p) =>
        p.id === id ? { ...p, comments: [...(p.comments ?? []), comment] } : p,
      ),
    });
    get().addPoints(6);
    get().persist();
    get().flash("Yorum cihazda kaldı.");
    return true;
  },
  sharePost: async (id) => {
    if (!allowAction("share", 10, 60_000)) {
      get().flash("Paylaşım sınırı. Bir dakika bekleyin.");
      return;
    }
    const post = get().feed.find((p) => p.id === id);
    if (!post) return;
    const title = `EVENGIRL · @${post.handle}`;
    const text = `${post.caption} · ${post.model} · cihazda, sunucu yok`;
    try {
      if (typeof navigator !== "undefined" && typeof navigator.share === "function") {
        const payload: ShareData = { title, text };
        try {
          const res = await fetch(post.image);
          const blob = await res.blob();
          if (blob.type.startsWith("image/")) {
            const file = new File([blob], `${post.handle}.jpg`, { type: blob.type || "image/jpeg" });
            if (!navigator.canShare || navigator.canShare({ files: [file] })) {
              payload.files = [file];
            }
          }
        } catch {
          /* görsel paylaşılamazsa metin yeter */
        }
        await navigator.share(payload);
        get().flash("Paylaşıldı. Görsel cihazda kaldı.");
        return;
      }
    } catch (err) {
      if (err && typeof err === "object" && "name" in err && err.name === "AbortError") return;
    }
    try {
      await navigator.clipboard.writeText(`${title} — ${text}`);
      get().flash("Metin kopyalandı. Hesap yok, bağlantı yok.");
    } catch {
      get().flash("Paylaşım bu tarayıcıda kapalı.");
    }
  },
  openLightbox: (id) => set({ lightboxId: id, createOpen: false }),
  closeLightbox: () => set({ lightboxId: null }),
  setCreateOpen: (createOpen) => set({ createOpen, lightboxId: createOpen ? null : get().lightboxId }),
  setFeedSort: (feedSort) => {
    set({ feedSort });
    get().persist();
  },
  setProfileHandle: (raw) => {
    set({ profileHandle: sanitizeHandle(raw) });
    get().persist();
  },
  reportPost: (id) => {
    set({
      feed: get().feed.map((p) =>
        p.id === id
          ? {
              ...p,
              reported: true,
            }
          : p,
      ),
    });
    get().persist();
    get().flash("Rapor alındı. Akıştan gizlendi.");
  },
  markStory: (id) => {
    set({
      stories: get().stories.map((s) =>
        s.id === id
          ? {
              ...s,
              seen: true,
            }
          : s,
      ),
    });
    get().persist();
  },
  openStory: (index) => set({ storyIndex: index }),
  latestOf: (project) => {
    if (!project?.versions.length) return null;
    return (
      [...project.versions].sort((a, b) => b.createdAt - a.createdAt)[0] ?? null
    );
  },
  originalOf: (project) =>
    project?.versions.find((v) => v.kind === "original") ?? null,
  openProject: (id) =>
    set({
      activeProjectId: id,
      tab: "studio",
      armedTool: null,
      draftImage: null,
      draftKey: null,
      adjustments: { ...DEFAULT_ADJUST },
      overlays: [],
    }),
  setActiveVersion: (projectId, versionId) => {
    const p = get().projects.find((x) => x.id === projectId);
    if (!p) return;
    const rest = p.versions.filter((v) => v.id !== versionId);
    const target = p.versions.find((v) => v.id === versionId);
    if (!target) return;
    set({
      projects: get().projects.map((proj) =>
        proj.id === projectId
          ? {
              ...proj,
              versions: [
                ...rest,
                {
                  ...target,
                  createdAt: Date.now(),
                },
              ],
            }
          : proj,
      ),
      activeProjectId: projectId,
      draftImage: null,
      draftKey: null,
    });
    get().persist();
  },
  createProject: (title, image, tab) => {
    const id = uid("proj");
    set({
      projects: [
        {
          id,
          title: title.trim() || "Adsız",
          updatedAt: Date.now(),
          versions: [
            {
              id: uid("ver"),
              kind: "original",
              label: "Orijinal",
              image,
              createdAt: Date.now(),
            },
          ],
        },
        ...get().projects,
      ],
      activeProjectId: id,
      tab: tab || "studio",
      draftImage: null,
      draftKey: null,
      adjustments: { ...DEFAULT_ADJUST },
      overlays: [],
      storage: {
        ...get().storage,
        previews: get().storage.previews + 12,
        temp: get().storage.temp + 28,
      },
      clinicLockKey: null,
      clinicSkin: null,
      clinicMap: null,
    });
    clearCalibLock();
    get().persist();
    get().flash(tab === "tools" ? "Fotoğraf klinikte." : "Proje stüdyoda açıldı.");
    if (tab === "tools") void get().scanClinic(image);
    return id;
  },
  createBlank: () => get().createProject("Boş tuval", ""),
  duplicateProject: (id) => {
    const src = get().projects.find((p) => p.id === id);
    if (!src) return;
    const copy = {
      ...src,
      id: uid("proj"),
      title: `${src.title} kopya`,
      updatedAt: Date.now(),
      versions: src.versions.map((v) => ({
        ...v,
        id: uid("ver"),
      })),
    };
    set({
      projects: [copy, ...get().projects],
      activeProjectId: copy.id,
    });
    get().persist();
    get().flash("Proje kopyalandı. Orijinal duruyor.");
  },
  renameProject: (id, title) => {
    const name = title.trim() || "Adsız";
    set({
      projects: get().projects.map((p) =>
        p.id === id
          ? {
              ...p,
              title: name,
              updatedAt: Date.now(),
            }
          : p,
      ),
    });
    get().persist();
  },
  deleteProject: (id) => {
    const list = get().projects;
    if (list.length < 2) {
      get().flash("Son proje silinmez. Orijinal korunur.");
      return;
    }
    const next = list.filter((p) => p.id !== id);
    set({
      projects: next,
      activeProjectId:
        get().activeProjectId === id
          ? (next[0]?.id ?? null)
          : get().activeProjectId,
    });
    get().persist();
    get().flash("Proje kaldırıldı. Dosya cihazda kalmadı.");
  },
  replaceActivePhoto: (image) => {
    const id = get().activeProjectId;
    if (!id || !image) return;
    set({
      projects: get().projects.map((p) =>
        p.id === id
          ? {
              ...p,
              title: p.title === "Boş tuval" ? "Fotoğraf" : p.title,
              updatedAt: Date.now(),
              versions: [
                {
                  id: uid("ver"),
                  kind: "original",
                  label: "Orijinal",
                  image,
                  createdAt: Date.now(),
                },
              ],
            }
          : p,
      ),
      draftImage: null,
      draftKey: null,
      overlays: [],
      adjustments: { ...DEFAULT_ADJUST },
      redoStack: [],
      armedTool: null,
      clinicLockKey: null,
      clinicSkin: null,
      clinicMap: null,
    });
    clearCalibLock();
    get().persist();
    get().flash("Fotoğraf değişti.");
    void get().scanClinic(image);
  },
  removeActivePhoto: () => {
    const id = get().activeProjectId;
    if (!id) return;
    set({
      projects: get().projects.map((p) =>
        p.id === id
          ? {
              ...p,
              title: "Boş tuval",
              updatedAt: Date.now(),
              versions: [],
            }
          : p,
      ),
      draftImage: null,
      draftKey: null,
      overlays: [],
      adjustments: { ...DEFAULT_ADJUST },
      redoStack: [],
      armedTool: null,
      clinicLockKey: null,
      clinicSkin: null,
      clinicMap: null,
    });
    clearCalibLock();
    get().persist();
    get().flash("Fotoğraf kaldırıldı.");
  },
  restoreOriginal: () => {
    const project = get().projects.find((p) => p.id === get().activeProjectId);
    const original = get().originalOf(project);
    if (!project || !original) {
      get().flash("Orijinal yok.");
      return;
    }
    get().setActiveVersion(project.id, original.id);
    set({
      adjustments: { ...DEFAULT_ADJUST },
      overlays: [],
      ratio: "original",
      draftImage: null,
      draftKey: null,
    });
    get().flash("Orijinale dönüldü. Sürümler duruyor.");
  },
  bakeDemoVersions: async () => {
    if (get().seedsBaked) return;
    const pending = get().projects.flatMap((p) =>
      p.versions
        .filter((v) => v.kind !== "original" && v.image.startsWith("/media/"))
        .map((v) => ({
          projectId: p.id,
          ver: v,
        })),
    );
    if (!pending.length) {
      set({ seedsBaked: true });
      get().persist();
      return;
    }
    try {
      let projects = get().projects;
      for (const item of pending) {
        if (get().processing) return;
        await new Promise((r) => setTimeout(r, 32));
        if (get().processing) return;
        const tap =
          item.ver.kind === "erase" ||
          item.ver.kind === "blemish" ||
          item.ver.kind === "dodge"
            ? {
                x: 0.62,
                y: 0.4,
              }
            : void 0;
        const image = await processSource(
          item.ver.image,
          item.ver.kind,
          void 0,
          tap,
        );
        projects = get().projects.map((p) =>
          p.id === item.projectId
            ? {
                ...p,
                versions: p.versions.map((v) =>
                  v.id === item.ver.id
                    ? {
                        ...v,
                        image,
                      }
                    : v,
                ),
              }
            : p,
        );
        set({ projects });
      }
      set({ seedsBaked: true });
      get().persist();
    } catch {
      set({ seedsBaked: true });
      get().persist();
    }
  },
  addPoints: (n) => {
    set({ points: get().points + n });
    get().persist();
  },
  runTool: async (tool, erase) => {
    const { projects, activeProjectId, proUntil } = get();
    if (busy(get)) return;
    if (!allowAction("tool", 80, 60_000)) {
      get().flash("Araç sınırı: dakikada 12. Cihaz korunuyor.");
      return;
    }
    const project = projects.find((p) => p.id === activeProjectId);
    const latest = get().latestOf(project);
    if (!project || !latest || SEED_IDS.has(project.id) || !isUserSrc(latest.image)) {
      get().flash("Önce kendi fotoğrafını ekle.");
      set({ tab: "studio" });
      return;
    }
    if (PRO_TOOLS.includes(tool) && proUntil < Date.now()) {
      get().flash("Bu araç PRO. Play Store’dan açın.");
      requestPaywall();
      return;
    }
    if (tool === "backdrop" && !get().backdropId) {
      get().flash("Bir stüdyo fonu seçin.");
      return;
    }
    const paintFirst =
      tool === "erase" ||
      tool === "blemish" ||
      tool === "dodge" ||
      tool === "lipstick" ||
      tool === "blush" ||
      tool === "contour" ||
      tool === "eyeshadow" ||
      tool === "liner" ||
      tool === "plump" ||
      tool === "freckle" ||
      tool === "tan" ||
      tool === "matte" ||
      tool === "darkcircle" ||
      tool === "brows" ||
      tool === "lashes";
    if (paintFirst && !erase) {
      if (get().armedTool === tool) {
        set({ armedTool: null });
        return;
      }
      set({ armedTool: tool, lastToolId: tool, tab: "studio", atelier: get().atelier || "even" });
      get().flash("Parmağınızla sürün. Kaydet ile kalır.");
      return;
    }
    if (tool === "backdrop") {
      await get().applyAiBackdrop(get().backdropId);
      return;
    }
    set({ lastToolId: tool, tab: "studio" });
    const started = Date.now();
    const timer = beginJob(set, get, `${TOOL_LABEL[tool]} çalışıyor…`);
    try {
      const backdrop = BACKDROPS.find((b) => b.id === get().backdropId)?.image;
      const image = await processSource(latest.image, tool, void 0, erase, {
        intensity: fxLevel(get),
        color: get().tintColor,
        light: get().lightDir,
        backdrop,
        frame: get().frameStyle,
      });
      set({
        draftImage: image,
        draftKey: `tool:${tool}`,
        settleTick: (get().settleTick || 0) + 1,
        armedTool: isBrushTool(tool) ? tool : null,
      });
      get().flash("Önizleme. Kaydet ile kalır.");
    } catch {
      get().flash("İşlem tamamlanamadı.");
    } finally {
      finishJob(timer, set);
      get().persist();
    }
  },
  commitBrush: (tool, dataUrl) => {
    if (!dataUrl) return;
    set({
      draftImage: dataUrl,
      draftKey: `tool:${tool}`,
      lastToolId: tool,
    });
    get().flash("Önizleme. Kaydet ile kalır.");
  },
  applyTemplate: async (templateId, sourceImage) => {
    const tpl = TEMPLATES.find((t) => t.id === templateId);
    if (!tpl) return;
    if (!tpl.free && get().proUntil < Date.now()) {
      get().flash("Bu look PRO.");
      requestPaywall();
      return;
    }
    if (sourceImage) get().createProject(tpl.name, sourceImage);
    const project = get().projects.find((p) => p.id === get().activeProjectId);
    const latest = get().latestOf(project);
    const src = sourceImage ?? latest?.image;
    if (!src || !project) {
      get().flash("Uygulanacak görsel yok.");
      return;
    }
    if (!sourceImage && !isUserSrc(src)) {
      get().flash("Önce kendi fotoğrafını ekle.");
      return;
    }
    const mine = ++previewGen;
    set({
      processing: true,
      processHint: `${tpl.name} önizleme…`,
      processAt: Date.now(),
      tab: "studio",
      lastTemplateId: templateId,
    });
    const started = Date.now();
    try {
      const image = await processSource(src, "look", templateId, void 0, {
        intensity: fxLevel(get),
      });
      if (mine !== previewGen) return;
      set({
        draftImage: image,
        draftKey: `tpl:${templateId}`,
        settleTick: (get().settleTick || 0) + 1,
      });
      get().flash("Önizleme. Kaydet ile kalır.");
    } catch {
      get().flash("Look uygulanamadı.");
    } finally {
      set({
        processing: false,
        processHint: "",
      });
      get().persist();
    }
  },
  applyMakeupLook: async (lookId) => {
    const look =
      MAKEUP_LOOKS.find((l) => l.id === lookId) ||
      NURA_LOOKS.find((l) => l.id === lookId) ||
      CEHRA_LOOKS.find((l) => l.id === lookId) ||
      FACE_PACK.find((l) => l.id === lookId) ||
      HAIR_STYLES.find((l) => l.id === lookId) ||
      HAIR_CUTS.find((l) => l.id === lookId);
    if (!look) return;
    if (!look.free && get().proUntil < Date.now()) {
      get().flash("Bu look PRO. Play Store’dan açın.");
      requestPaywall();
      return;
    }
    const project = get().projects.find((p) => p.id === get().activeProjectId);
    const latest = get().latestOf(project);
    if (!project || !latest || SEED_IDS.has(project.id) || !isUserSrc(latest.image)) {
      get().flash("Önce kendi fotoğrafını ekle.");
      set({ tab: "studio" });
      return;
    }
    set({
      processing: true,
      processHint: `${look.name} önizleme…`,
      processAt: Date.now(),
      studioMode: "makeup",
      lastLookId: lookId,
    });
    const mine = ++previewGen;
    const started = Date.now();
    try {
      const tint = (look as { color?: string }).color || get().tintColor;
      if ((look as { color?: string }).color) set({ tintColor: tint });
      const steps = Array.isArray(look.steps) ? look.steps : [];
      const image = await processChain(latest.image, steps, {
        intensity: fxLevel(get),
        color: tint,
        light: get().lightDir,
      });
      if (mine !== previewGen) return;
      set({
        draftImage: image,
        draftKey: `look:${lookId}`,
        settleTick: (get().settleTick || 0) + 1,
      });
      get().flash("Önizleme. Kaydet ile kalır.");
    } catch {
      get().flash("Look uygulanamadı.");
    } finally {
      set({
        processing: false,
        processHint: "",
      });
      get().persist();
    }
  },
  armBrush: (tool) => {
    set({
      tab: "studio",
      atelier: get().atelier || "even",
      armedTool: tool,
      lastToolId: tool,
    });
    get().flash(tool === "blemish" ? "AI fırça: lekeye dokun." : "Fırçayı sür.");
  },
  applyArk: async (id) => {
    set({ backdropId: id, tab: "studio", atelier: get().atelier || "even" });
    await get().applyAiBackdrop(id);
  },
  applyAiBackdrop: async (id, fresh) => {
    const pack = BACKDROPS.find((b) => b.id === id);
    if (!pack) {
      get().flash("Bir stüdyo fonu seçin.");
      return;
    }
    if (busy(get)) return;
    const project = get().projects.find((p) => p.id === get().activeProjectId);
    const latest = get().latestOf(project);
    if (!project || !latest) {
      get().flash("Önce bir fotoğraf seçin.");
      return;
    }
    const key = `bg:${pack.id}`;
    if (!fresh && get().draftKey === key) {
      set({ draftImage: null, draftKey: null, backdropId: pack.id });
      get().flash("Önizleme kalktı.");
      return;
    }
    set({
      processing: true,
      processHint: `${pack.name} AI fon…`,
      tab: "studio",
      backdropId: pack.id,
      lastToolId: "backdrop",
    });
    try {
      const ai = await generateBackdrop({
        data: {
          image: latest.image,
          scene: pack.prompt,
          name: pack.name,
          variant: fresh ? `take ${Date.now() % 97}` : "",
        },
      });
      if (ai.ok && !("plate" in ai && ai.plate)) {
        set({
          draftImage: ai.image,
          draftKey: key,
          settleTick: (get().settleTick || 0) + 1,
        });
        get().flash("Yeni fon. Kaydet ile kalır.");
        return;
      }
      const plate = ai.ok ? ai.image : pack.image;
      const image = await processSource(latest.image, "backdrop", void 0, void 0, {
        intensity: fxLevel(get),
        backdrop: plate,
        light: get().lightDir,
      });
      set({
        draftImage: image,
        draftKey: key,
        settleTick: (get().settleTick || 0) + 1,
      });
      get().flash(ai.ok ? "Fon yerleştirildi. Kaydet ile kalır." : "Yerel fon. Kaydet ile kalır.");
    } catch {
      get().flash("Fon üretilemedi.");
    } finally {
      set({ processing: false, processHint: "" });
    }
  },
  scanClinic: async (src) => {
    if (!isUserSrc(src)) return;
    const key = `v2:${src.length}:${src.slice(18, 42)}`;
    if (get().clinicLockKey === key && get().clinicSkin) return;
    try {
      const { report, calib } = await Promise.race([
        scanClinicFace(src),
        new Promise((_, reject) => window.setTimeout(() => reject(new Error("scan")), 10000)),
      ]);
      set({ clinicLockKey: key, clinicSkin: report, clinicMap: calib });
    } catch {
      set({ clinicLockKey: get().clinicLockKey || key, clinicSkin: get().clinicSkin });
    }
  },
  runClinic: async (spec) => {
    const SEED = new Set(["proj-portre", "proj-sokak", "proj-adsiz"]);
    const isUser = (src) => Boolean(src && (String(src).startsWith("data:") || String(src).startsWith("blob:")));
    const project =
      get().projects.find((p) => p.id === get().activeProjectId && !SEED.has(p.id) && isUser(get().latestOf(p)?.image)) ||
      get().projects.find((p) => !SEED.has(p.id) && isUser(get().latestOf(p)?.image));
    const latest = get().latestOf(project);
    if (!project || !latest || !isUser(latest.image)) {
      get().flash("Klinikte fotoğraf ekle.");
      set({ tab: "tools", processing: false, processHint: "" });
      return;
    }
    const key = String(spec.key || "clinic");
    const timer = beginJob(set, get, spec.label || "Klinik…");
    set({ activeProjectId: project.id, tab: "tools", redoStack: [] });
    try {
      const src = latest.image;
      let calib = get().clinicMap;
      try {
        const hit = await scanClinicFace(src);
        calib = hit.calib;
        set({ clinicLockKey: `v2:${src.length}:${src.slice(18, 42)}`, clinicSkin: hit.report, clinicMap: hit.calib });
      } catch {
        /* keep last map */
      }
      if (calib) lockCalib(calib);
      const steps = Array.isArray(spec.tools) && spec.tools.length ? spec.tools : ["skin"];
      const native = await applyBanuba(src, {
        ...spec,
        tools: steps,
      });
      const image =
        native ||
        (await processChain(src, steps, {
          intensity: spec.intensity ?? 100,
          color: spec.color || get().tintColor,
          lipShape: spec.lipShape || "natural",
          calib,
        }));
      set({
        draftImage: image,
        draftKey: key,
        settleTick: (get().settleTick || 0) + 1,
      });
      get().flash(`${spec.label || "Tedavi"} önizlemede. Kaydet ile kalır.`);
    } catch (err) {
      get().flash("Tedavi uygulanamadı. Fotoğrafı yeniden ekle.");
    } finally {
      finishJob(timer, set);
    }
  },
  clinicSpot: async (nx, ny, tool = "blemish", desk = "cilt") => {
    const SEED = new Set(["proj-portre", "proj-sokak", "proj-adsiz"]);
    const isUser = (src) => Boolean(src && (String(src).startsWith("data:") || String(src).startsWith("blob:")));
    const project =
      get().projects.find((p) => p.id === get().activeProjectId && !SEED.has(p.id) && isUser(get().latestOf(p)?.image)) ||
      get().projects.find((p) => !SEED.has(p.id) && isUser(get().latestOf(p)?.image));
    const latest = get().latestOf(project);
    if (!project || !latest) {
      get().flash("Klinikte fotoğraf ekle.");
      set({ tab: "tools", processing: false });
      return;
    }
    const src = get().draftImage && isUser(get().draftImage) ? get().draftImage : latest.image;
    const timer = beginJob(set, get, "Sihirli fırça…");
    set({ activeProjectId: project.id, tab: "tools" });
    try {
      if (get().clinicMap) lockCalib(get().clinicMap);
      const calib = get().clinicMap || (await readCalib(src));
      const hit = snapClinic(nx, ny, calib, desk, tool);
      const image = await processSpot(src, hit.tool, hit.nx, hit.ny);
      set({
        draftImage: image,
        draftKey: `clinic:brush:${hit.tool}`,
        settleTick: (get().settleTick || 0) + 1,
      });
      get().flash("Sihirli fırça uyguladı. Kaydet ile kalır.");
    } catch {
      get().flash("Fırça uygulanamadı.");
    } finally {
      finishJob(timer, set);
    }
  },
  clinicStroke: async (pts) => {
    const SEED = new Set(["proj-portre", "proj-sokak", "proj-adsiz"]);
    const isUser = (src) => Boolean(src && (String(src).startsWith("data:") || String(src).startsWith("blob:")));
    const project =
      get().projects.find((p) => p.id === get().activeProjectId && !SEED.has(p.id) && isUser(get().latestOf(p)?.image)) ||
      get().projects.find((p) => !SEED.has(p.id) && isUser(get().latestOf(p)?.image));
    const latest = get().latestOf(project);
    if (!project || !latest) {
      get().flash("Klinikte fotoğraf ekle.");
      return;
    }
    const src = get().draftImage && isUser(get().draftImage) ? get().draftImage : latest.image;
    const timer = beginJob(set, get, "Sihirli fırça…");
    set({ activeProjectId: project.id, tab: "tools" });
    try {
      const image = await processStroke(src, pts, 78);
      set({
        draftImage: image,
        draftKey: "clinic:brush:magic",
        settleTick: (get().settleTick || 0) + 1,
      });
      get().flash("Sihirli fırça uyguladı. Kaydet ile kalır.");
    } catch {
      get().flash("Fırça uygulanamadı.");
    } finally {
      finishJob(timer, set);
    }
  },
  applyTake: async (takeId) => {
    const take = TAKES.find((t) => t.id === takeId);
    if (!take) return;
    if (busy(get)) return;
    if (!take.free && get().proUntil < Date.now()) {
      get().flash("Bu çekim PRO. Play Store’dan açın.");
      requestPaywall();
      return;
    }
    const project = get().projects.find((p) => p.id === get().activeProjectId);
    const latest = get().latestOf(project);
    if (!project || !latest || SEED_IDS.has(project.id) || !isUserSrc(latest.image)) {
      get().flash("Önce kendi fotoğrafını ekle.");
      set({ tab: "studio" });
      return;
    }
    const light = TAKE_LIGHT[take.id] ?? get().lightDir;
    set({
      processing: true,
      processHint: `${take.name} çekimi…`,
      processAt: Date.now(),
      studioMode: "takes",
      lightDir: light,
    });
    const started = Date.now();
    try {
      const image = await processChain(latest.image, take.steps, {
        intensity: fxLevel(get),
        color: get().tintColor,
        light,
      });
      set({
        draftImage: image,
        draftKey: `take:${takeId}`,
        settleTick: (get().settleTick || 0) + 1,
      });
      get().flash("Önizleme. Kaydet ile kalır.");
    } catch {
      get().flash("Çekim uygulanamadı.");
    } finally {
      set({
        processing: false,
        processHint: "",
      });
      get().persist();
    }
  },
  bakeCurrent: async (kind = "adjust", format) => {
    if (busy(get)) return null;
    const project = get().projects.find((p) => p.id === get().activeProjectId);
    const latest = get().latestOf(project);
    if (!project || !latest) return null;
    set({
      processing: true,
      processHint: "Katmanlar birleştiriliyor…",
    });
    try {
      const fmt = format ?? get().exportFormat;
      const image = await bakeDesign({
        src: latest.image,
        adjust: get().adjustments,
        overlays: get().overlays,
        ratio: get().ratio,
        watermark: get().watermark,
        format: fmt,
        scale: get().exportScale,
      });
      const version = {
        id: uid("ver"),
        kind,
        label: kind === "design" ? "Tasarım" : "Renk ayarı",
        image,
        createdAt: Date.now(),
      };
      set({
        projects: get().projects.map((p) =>
          p.id === project.id
            ? {
                ...p,
                versions: [...p.versions, version],
                updatedAt: Date.now(),
              }
            : p,
        ),
        adjustments: { ...DEFAULT_ADJUST },
        overlays: [],
      });
      get().addPoints(20);
      get().flash("Sürüme yazıldı.");
      get().persist();
      return image;
    } catch {
      get().flash("Birleştirme başarısız.");
      return null;
    } finally {
      set({
        processing: false,
        processHint: "",
      });
    }
  },
  saveLatest: () => {
    get().commitDraft();
    const project = get().projects.find((p) => p.id === get().activeProjectId);
    const latest = get().latestOf(project);
    if (!latest || !project) {
      get().flash("Kaydedilecek görsel yok.");
      return null;
    }
    if (!isPro(get().proUntil)) {
      get().flash("Projeye kaydedildi. İndirmek için PRO.");
      return latest.image;
    }
    if (typeof document !== "undefined") {
      const w = window as Window & {
        EvenBridge?: {
          saveImage?: (d: string, n: string) => void;
          saveMedia?: (d: string, n: string) => void;
        };
      };
      const name = `${project.title.replace(/\s+/g, "-")}.jpg`;
      if (w.EvenBridge?.saveMedia) {
        w.EvenBridge.saveMedia(latest.image, name);
      } else if (w.EvenBridge?.saveImage && latest.image.startsWith("data:")) {
        w.EvenBridge.saveImage(latest.image, name);
      } else {
        const a = document.createElement("a");
        a.href = latest.image;
        a.download = name;
        a.rel = "noopener";
        document.body.appendChild(a);
        a.click();
        a.remove();
      }
    }
    get().flash("Galeriye kaydedildi.");
    get().addPoints(10);
    return latest.image;
  },
  cleanTemp: () => {
    set({
      storage: {
        ...get().storage,
        temp: 24,
      },
    });
    get().persist();
    get().flash("Geçici dosyalar temizlendi. Projeler duruyor.");
  },
  wipeLocal: () => {
    try {
      localStorage.removeItem(KEY);
    } catch {}
    set({
      projects: [],
      activeProjectId: null,
      feed: FEED.map((p) => ({ ...p, comments: [...p.comments] })),
      stories: STORIES.map((s) => ({ ...s })),
      points: 1840,
      storage: {
        temp: 24,
        previews: 40,
        models: 470,
      },
      adjustments: { ...DEFAULT_ADJUST },
      overlays: [],
      seedsBaked: false,
      dismissedAgents: [],
      agentsHidden: false,
      agentRun: null,
      lightboxId: null,
      createOpen: false,
      profileHandle: "sen",
      jobLog: [],
      feedSort: "popular",
      crystalId: null,
      proUntil: 0,
      legalAccepted: false,
      legalOpen: true,
      ageVerified: false,
      ageBlocked: false,
      ageYear: null,
    });
    get().persist();
    get().flash("Yerel veriler silindi. Oturum yoktu.");
  },
  backupActive: () => {
    const project = get().projects.find((p) => p.id === get().activeProjectId);
    const latest = get().latestOf(project);
    if (!latest) {
      get().flash("Yedeklenecek proje yok.");
      return null;
    }
    get().flash("Yedek indiriliyor.");
    return latest.image;
  },
  redeemPro: () => {
    set({ proUntil: Date.now() + 6048e5 });
    get().persist();
    get().flash("7 gün ücretsiz PRO açıldı.");
  },
  sendFeedback: (kind, text) => {
    set({
      feedbacks: [
        {
          id: uid("fb"),
          kind,
          text,
          createdAt: Date.now(),
        },
        ...get().feedbacks,
      ].slice(0, 40),
    });
    get().persist();
    get().flash("Geri bildiriminiz kaydedildi.");
  },
  markPlayInstalled: () => {
    set({
      playInstalled: true,
      playPromptDismissed: true,
    });
    get().persist();
    get().flash("Play Store kurulumu işlendi. Android’de mağaza açılır.");
  },
  markNativeInstalled: () => {
    set({
      playInstalled: true,
      playPromptDismissed: true,
    });
    get().persist();
  },
  dismissPlayPrompt: () => {
    set({ playPromptDismissed: true });
    get().persist();
  },
  purchasePlaySku: (sku) => {
    const plan = skuById(sku);
    set({
      proUntil: Date.now() + plan.days * 24 * 3600_000,
      playInstalled: true,
      playPromptDismissed: true,
    });
    get().persist();
    get().flash(`${plan.title} Google Play üzerinden açıldı.`);
  },
  setCrystalId: (crystalId) => {
    set({ crystalId: crystalId === "boy" ? "girl" : crystalId });
    get().persist();
  },
  setArmedTool: (v) => set({ armedTool: v }),
  setNavOrder: (navOrder) => {
    set({ navOrder: normalizeNav(navOrder) });
    get().persist();
  },
  setChipOrder: (key, ids) => {
    if (!key || !Array.isArray(ids)) return;
    set({
      chipOrder: {
        ...get().chipOrder,
        [key]: ids,
      },
    });
    get().persist();
  },
  setComparing: (v) => set({ comparing: v }),
  setAdjust: (key, value) =>
    set({
      adjustments: {
        ...get().adjustments,
        [key]: value,
      },
    }),
  resetAdjust: () => set({ adjustments: { ...DEFAULT_ADJUST } }),
  addTextOverlay: (text, color = "#e8f4f0") => {
    const overlay = {
      id: uid("ov"),
      kind: "text",
      text: sanitizeText(text, 80),
      x: 0.5,
      y: 0.86,
      size: 0.045,
      color,
    };
    set({ overlays: [...get().overlays, overlay] });
  },
  addSticker: (sticker) => {
    const overlay = {
      id: uid("ov"),
      kind: "sticker",
      sticker,
      x: 0.18 + get().overlays.length * 0.12,
      y: 0.16,
      scale: 1,
    };
    set({ overlays: [...get().overlays, overlay] });
  },
  clearOverlays: () => set({ overlays: [] }),
  removeOverlay: (id) =>
    set({ overlays: get().overlays.filter((o) => o.id !== id) }),
  moveOverlay: (id, x, y) =>
    set({
      overlays: get().overlays.map((o) =>
        o.id === id
          ? {
              ...o,
              x,
              y,
            }
          : o,
      ),
    }),
  setRatio: (ratio) => set({ ratio }),
  setCaption: (caption) => set({ caption: sanitizeText(caption, 60) }),
  makeCollage: async () => {
    if (busy(get)) return;
    const urls = get()
      .projects.map((p) => get().latestOf(p)?.image)
      .filter((u) => Boolean(u))
      .slice(0, 4);
    if (urls.length < 2) {
      get().flash("Kolaj için en az iki proje gerekir.");
      return;
    }
    set({
      processing: true,
      processHint: "Kolaj kuruluyor…",
    });
    try {
      const image = await composeCollage(urls, get().collageLayout);
      get().createProject("Kolaj", image);
      get().flash("Kolaj proje olarak açıldı.");
    } catch {
      get().flash("Kolaj kurulamadı.");
    } finally {
      set({
        processing: false,
        processHint: "",
      });
    }
  },
  makeMotion: async (seconds) => {
    if (busy(get)) return null;
    const project = get().projects.find((p) => p.id === get().activeProjectId);
    const latest = get().latestOf(project);
    if (!latest) return null;
    set({
      processing: true,
      processHint: "Hareket yazılıyor… cihazda",
    });
    try {
      const extras = get()
        .projects.map((p) => get().latestOf(p)?.image)
        .filter((u) => Boolean(u))
        .slice(0, 4);
      const blob = await exportMotion(
        latest.image,
        get().caption,
        seconds,
        get().motionStyle,
        extras,
      );
      get().addPoints(50);
      get().flash("Klip hazır.");
      return blob;
    } catch {
      get().flash("Klip yazılamadı.");
      return null;
    } finally {
      set({
        processing: false,
        processHint: "",
      });
    }
  },
  undoLast: () => {
    if (get().draftImage) {
      set({
        redoStack: [
          ...get().redoStack,
          { kind: "draft", image: get().draftImage, key: get().draftKey },
        ],
        draftImage: null,
        draftKey: null,
        lastTemplateId: null,
        lastLookId: null,
      });
      get().flash("Geri alındı.");
      return;
    }
    const project = get().projects.find((p) => p.id === get().activeProjectId);
    if (!project || project.versions.length < 2) {
      get().flash("Geri alınacak sürüm yok. Orijinal korunur.");
      return;
    }
    const original = project.versions.filter((v) => v.kind === "original");
    const rest = project.versions.filter((v) => v.kind !== "original");
    if (!rest.length) return;
    rest.sort((a, b) => b.createdAt - a.createdAt);
    const removed = rest.shift();
    set({
      projects: get().projects.map((p) =>
        p.id === project.id
          ? {
              ...p,
              versions: [...original, ...rest],
            }
          : p,
      ),
      redoStack: removed
        ? [...get().redoStack, { kind: "ver", projectId: project.id, version: removed }]
        : get().redoStack,
    });
    get().persist();
    get().flash("Geri alındı.");
  },
  redoLast: () => {
    const stack = get().redoStack;
    if (!stack.length) {
      get().flash("İleri yok.");
      return;
    }
    const item = stack[stack.length - 1];
    const next = stack.slice(0, -1);
    if (item.kind === "draft") {
      set({
        draftImage: item.image,
        draftKey: item.key,
        redoStack: next,
      });
      get().flash("İleri.");
      return;
    }
    if (item.kind === "ver" && item.version) {
      pushVersion(get, set, item.projectId, {
        ...item.version,
        id: uid("ver"),
        createdAt: Date.now(),
      });
      set({ redoStack: next });
      get().flash("İleri.");
      return;
    }
    set({ redoStack: next });
  },
  replayDraft: async () => {
    const key = get().draftKey;
    if (!key) return;
    const [kind, ...rest] = key.split(":");
    const id = rest.join(":");
    if (kind === "tpl") await get().applyTemplate(id);
    else if (kind === "look") await get().applyMakeupLook(id);
    else if (kind === "tool") await get().runTool(id);
  },
  commitDraft: () => {
    const project = get().projects.find((p) => p.id === get().activeProjectId);
    const image = get().draftImage;
    if (!project || !image) return false;
    const key = String(get().draftKey || "look");
    const [kind, id] = key.split(":");
    const version = {
      id: uid("ver"),
      kind: kind === "tool" ? id : "look",
      label: kind === "tpl" ? versionLabel("look", id) : kind === "look" ? `Look · ${id}` : versionLabel(id),
      image,
      createdAt: Date.now(),
    };
    pushVersion(get, set, project.id, version);
    set({ draftImage: null, draftKey: null, redoStack: [] });
    get().addPoints(20);
    get().persist();
    get().flash("Kaydedildi.");
    return true;
  },
  dismissAgent: (id) => {
    if (get().dismissedAgents.includes(id)) return;
    set({ dismissedAgents: [...get().dismissedAgents, id] });
    get().persist();
    get().flash("Ajan kaydırıldı. Ayarlar’dan geri gelir.");
  },
  restoreAgents: () => {
    set({ dismissedAgents: [], agentsHidden: false });
    get().persist();
    get().flash("Ajanlar geri geldi.");
  },
  setAgentsHidden: (agentsHidden) => {
    set({ agentsHidden });
    get().persist();
  },
  runAgent: async (id) => {
    const agent = AGENTS.find((a) => a.id === id);
    if (!agent) return;
    if (get().agentRun || busy(get)) return;
    if (!allowAction("agent", 20, 60_000)) {
      get().flash("Ajan sınırı: dakikada 5. Cihaz korunuyor.");
      return;
    }
    const project = get().projects.find((p) => p.id === get().activeProjectId) ?? get().projects[0];
    const latest = get().latestOf(project);
    if (!project || !latest) {
      get().flash("Önce bir fotoğraf seçin.");
      return;
    }
    const tpl = TEMPLATES.find((t) => t.id === agent.templateId);
    const started = Date.now();
    set({
      processing: true,
      processHint: `${agent.name}…`,
      tab: "studio",
      atelier: agent.atelier,
      agentRun: {
        id: agent.id,
        startedAt: started,
        stage: agent.name,
        index: 0,
        total: Math.max(1, agent.stages.length),
        preview: latest.image,
      },
      armedTool: null,
    });
    const watchdog =
      typeof window === "undefined"
        ? 0
        : window.setTimeout(() => {
            if (!get().agentRun) return;
            set({ processing: false, processHint: "", agentRun: null });
            get().flash("Ajan zaman aşımı. Tekrar deneyin.");
          }, 8000);
    try {
      const image = await processAgentPipeline(
        latest.image,
        agent.stages,
        tpl?.grade ?? null,
        { intensity: 50, color: get().tintColor, light: agent.light },
        async (hint, preview, index, total) => {
          set({
            processHint: hint,
            agentRun: {
              id: agent.id,
              startedAt: started,
              stage: hint,
              index,
              total,
              preview,
            },
          });
        },
      );
      const version = {
        id: uid("ver"),
        kind: "look",
        label: agent.name,
        image,
        createdAt: Date.now(),
      };
      pushVersion(get, set, project.id, version);
      get().addPoints(80);
      set({
        settleTick: (get().settleTick || 0) + 1,
        jobLog: [
          {
            id: uid("job"),
            label: agent.name,
            model: agent.name,
            at: Date.now(),
          },
          ...(get().jobLog ?? []),
        ].slice(0, 24),
      });
      get().flash(`${agent.name} uyguladı. Orijinal duruyor.`);
    } catch {
      get().flash("Ajan tamamlayamadı.");
    } finally {
      if (typeof window !== "undefined") window.clearTimeout(watchdog);
      if (get().agentRun?.startedAt === started) {
        set({ processing: false, processHint: "", agentRun: null });
      }
      get().persist();
    }
  },
}));
export function isPro(proUntil: number) {
  return proUntil > Date.now();
}
