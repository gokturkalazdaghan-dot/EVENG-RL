import { MascotHeader } from "@/components/mascots";
import { STUDIO_EFFECTS, TEMPLATES } from "@/lib/catalog";
import { gradeCss } from "@/lib/templates";
import { isPro, useApp } from "@/lib/store";
import { cn, requestPaywall } from "@/lib/utils";
import { Lock } from "lucide-react";
import { useMemo, useState } from "react";

const CATS = [
  { id: "all", label: "Tümü" },
  { id: "look", label: "Look" },
  { id: "nura", label: "Güzellik" },
  { id: "orbit", label: "Film" },
  { id: "cehra", label: "Makyaj" },
  { id: "relyn", label: "Arşiv" },
  { id: "reira", label: "Işık" },
  { id: "pacca", label: "Reel" },
  { id: "pro", label: "PRO" },
] as const;

export function EffectsScreen() {
  const applyMakeupLook = useApp((s) => s.applyMakeupLook);
  const applyTemplate = useApp((s) => s.applyTemplate);
  const projects = useApp((s) => s.projects);
  const latestOf = useApp((s) => s.latestOf);
  const flash = useApp((s) => s.flash);
  const setTab = useApp((s) => s.setTab);
  const pro = isPro(useApp((s) => s.proUntil));
  const [cat, setCat] = useState<(typeof CATS)[number]["id"]>("all");
  const userPhoto = projects.find((p) => {
    const img = latestOf(p)?.image || "";
    return img.startsWith("data:") || img.startsWith("blob:");
  });
  const face = userPhoto ? latestOf(userPhoto)?.image || "" : "";

  const cards = useMemo(() => {
    const looks = STUDIO_EFFECTS.filter((fx) => (cat === "all" || cat === "look" || (cat === "pro" && !fx.free)));
    const tpls = TEMPLATES.filter((t) => {
      if (cat === "look") return false;
      if (cat === "all") return true;
      if (cat === "pro") return !t.free;
      return t.pack === cat;
    }).map((t) => ({
      id: `tpl:${t.id}`,
      name: t.name,
      hint: t.pack || "filtre",
      template: t.id,
      look: undefined as string | undefined,
      free: t.free,
      preview: t.preview,
      filter: gradeCss(t.grade),
    }));
    const lookCards = (cat === "all" || cat === "look" || cat === "pro" ? STUDIO_EFFECTS : looks).map((fx) => ({
      id: fx.id,
      name: fx.name,
      hint: fx.hint,
      template: fx.template,
      look: fx.look,
      free: fx.free,
      preview: fx.preview,
      filter: undefined as string | undefined,
    }));
    if (cat === "look") return lookCards;
    if (cat === "pro") return [...lookCards.filter((c) => !c.free), ...tpls];
    if (cat === "all") return [...lookCards, ...tpls];
    return tpls;
  }, [cat]);

  async function run(fx: { look?: string; template?: string; free: boolean; name: string }) {
    if (!userPhoto) {
      flash("Önce Projeler’den fotoğraf ekle.");
      setTab("projects");
      return;
    }
    useApp.setState({ activeProjectId: userPhoto.id });
    if (!fx.free && !pro) {
      requestPaywall();
      flash("Bu efekt PRO.");
      return;
    }
    if (fx.look) await applyMakeupLook(fx.look);
    else if (fx.template) await applyTemplate(fx.template);
    setTab("studio");
  }

  return (
    <div className="flex flex-col gap-3 pb-4">
      <MascotHeader title="Efektler" line={`${TEMPLATES.length + STUDIO_EFFECTS.length} look · senin karelin`} />
      {!face ? (
        <button type="button" className="fx-empty" onClick={() => setTab("projects")}>
          Önce bir fotoğraf aç — efekt senin karelin üzerinde durur.
        </button>
      ) : null}
      <div className="fx-cats">
        {CATS.map((c) => (
          <button key={c.id} type="button" className={cn("fx-cat", cat === c.id && "on")} onClick={() => setCat(c.id)}>
            {c.label}
          </button>
        ))}
      </div>
      <div className="fx-grid">
        {cards.map((fx) => (
          <button
            key={fx.id}
            type="button"
            className={cn("fx-card", !fx.free && "pro")}
            onClick={() => void run(fx)}
          >
            <img src={face || fx.preview} alt={fx.name} style={fx.filter ? { filter: fx.filter } : undefined} />
            <span className="fx-card-veil" />
            <span className="fx-card-meta">
              <strong>{fx.name}</strong>
              <em>{fx.hint}</em>
            </span>
            {!fx.free ? (
              <span className="fx-lock">
                <Lock className="size-3.5" />
                PRO
              </span>
            ) : null}
          </button>
        ))}
      </div>
    </div>
  );
}
