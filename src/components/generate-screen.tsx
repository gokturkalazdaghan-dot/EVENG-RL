import { CrystalButton } from "@/components/crystal-button";
import { MascotHeader } from "@/components/mascots";
import { SCENE_PACK } from "@/lib/catalog";
import { gatedDownload } from "@/lib/download";
import { processSource } from "@/lib/fx";
import { IMAGE_ACCEPT, allowAction, ingestImageFile } from "@/lib/guard";
import { useDropFile } from "@/lib/drop-file";
import { softNote } from "@/lib/soft-note";
import { useT } from "@/lib/i18n";
import { generateFaceScene, generateStill, pollTalking, startTalking, generateClip, generateKling, engineStatus } from "@/lib/imagine-api";
import { fetchScenes, fetchWeather } from "@/lib/public-feed";
import { withTimeout } from "@/lib/timed";
import { isPro, useApp } from "@/lib/store";
import { cn, requestPaywall } from "@/lib/utils";
import { Lock, Sparkles } from "lucide-react";
import { useEffect, useRef, useState } from "react";

type Card = { id: string; name: string; image: string; free: boolean; locked: boolean };
const SECS = [15, 30, 60] as const;

export function GenerateScreen() {
  const t = useT();
  const createProject = useApp((s) => s.createProject);
  const makeCollage = useApp((s) => s.makeCollage);
  const flash = useApp((s) => s.flash);
  const setTab = useApp((s) => s.setTab);
  const pro = isPro(useApp((s) => s.proUntil));
  const fileRef = useRef<HTMLInputElement>(null);
  const [faces, setFaces] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [hint, setHint] = useState("");
  const [cards, setCards] = useState<Card[]>([]);
  const [picked, setPicked] = useState<string[]>([]);
  const [prompt, setPrompt] = useState("");
  const [seconds, setSeconds] = useState<(typeof SECS)[number]>(15);
  const [clip, setClip] = useState<string | null>(null);
  const [motors, setMotors] = useState<{ id: string; label: string; on: boolean }[]>([]);
  const [sky, setSky] = useState("");
  const face = faces[0] || null;

  useEffect(() => {
    void engineStatus().then((res) => {
      if (res && "image" in res) setMotors([...res.image, ...res.video]);
    });
    const place = (lat?: number, lon?: number) => {
      void fetchWeather({ data: { lat, lon } }).then((r) => {
        if (r?.line) setSky(r.line);
      });
    };
    if (typeof navigator !== "undefined" && navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (p) => place(p.coords.latitude, p.coords.longitude),
        () => place(),
        { maximumAge: 600_000, timeout: 4000 },
      );
    } else place();
  }, []);

  async function onFaces(list: FileList | File | null) {
    const files = list instanceof File ? [list] : list ? Array.from(list) : [];
    if (!files.length) return;
    const next: string[] = [...faces];
    for (const file of files.slice(0, 5)) {
      if (next.length >= 5) break;
      const result = await ingestImageFile(file);
      if (!result.ok) {
        softNote("Fotoğraf alınamadı", result.error);
        continue;
      }
      next.push(result.dataUrl);
    }
    setFaces(next);
    setCards([]);
    setPicked([]);
    if (next.length) flash(`${next.length} fotoğraf. 10 manzara üret.`);
  }

  async function bakeScenes() {
    if (!faces.length) {
      flash("Önce 1–5 fotoğraf yükle.");
      return;
    }
    setBusy(true);
    setHint("10 manzara örülüyor…");
    const next: Card[] = [];
    const stock = await fetchScenes().catch(() => []);
    try {
      for (let i = 0; i < SCENE_PACK.length; i++) {
        const scene = SCENE_PACK[i];
        const src = faces[i % faces.length];
        setHint(`${i + 1}/10 · Flux · ${scene.name}`);
        const locked = !scene.free && !pro;
        if (locked) {
          next.push({ id: scene.id, name: scene.name, image: scene.image, free: false, locked: true });
          continue;
        }
        const ai = await generateFaceScene({
          data: { image: src, scene: scene.prompt || scene.name, name: scene.name },
        });
        if (ai.ok) {
          next.push({ id: scene.id, name: scene.name, image: ai.image, free: scene.free, locked: false });
          setHint(`${i + 1}/10 · ${"engine" in ai ? ai.engine : "ai"} · ${scene.name}`);
          continue;
        }
        const image = await processSource(src, "backdrop", void 0, void 0, {
          intensity: 58,
          backdrop: stock[i]?.image || scene.image,
          light: scene.light,
        });
        next.push({ id: scene.id, name: scene.name, image, free: scene.free, locked: false });
      }
      setCards(next);
      if (stock.length) {
        setCards((cur) => [
          ...cur,
          ...stock.slice(0, 4).map((s) => ({ id: s.id, name: s.name, image: s.image, free: true, locked: false })),
        ]);
      }
      flash("10 manzara hazır. Seç, stüdyoda aç veya kolaj yap.");
    } catch {
      flash("Manzaralar tamamlanamadı.");
    } finally {
      setBusy(false);
      setHint("");
    }
  }

  async function onImagine() {
    const text = prompt.trim();
    if (text.length < 4) {
      flash("Kısa bir sahne yaz.");
      return;
    }
    if (!allowAction("img", 4, 60_000)) {
      flash("Çok hızlı. Bir dakika bekle.");
      return;
    }
    setBusy(true);
    setHint("Görsel motorları sırayla deneniyor…");
    try {
      const res = await withTimeout(generateStill({ data: { prompt: text, ratio: "3:4", image: face || undefined } }), 60_000);
      if (!res.ok) {
        softNote("Üretim olmadı", res.error || "Motorlar şu an meşgul. Bir dakika sonra dene.");
        return;
      }
      createProject(text.slice(0, 28), res.image);
      flash(`${"engine" in res ? res.engine : "AI"} hazır.`);
      setTab("studio");
    } catch {
      flash("Üretim bağlanamadı.");
      softNote("Bağlantı yok", "Görsel motoruna ulaşılamadı. Ağını kontrol et, tekrar dene.");
    } finally {
      setBusy(false);
      setHint("");
    }
  }

  async function onVideo() {
    const text = prompt.trim();
    if (text.length < 4) {
      flash("Video için bir cümle yaz.");
      return;
    }
    setBusy(true);
    setClip(null);
    setHint("HeyGen ajanı başlıyor…");
    try {
      const start = await startTalking({ data: { prompt: text, image: face || undefined, seconds } });
      if (!start.ok) {
        setHint("Kling deneniyor…");
        const kling = await generateKling({
          data: { prompt: text, image: face || undefined, seconds: seconds >= 10 ? 10 : 5 },
        });
        if (kling.ok && "video" in kling && kling.video) {
          setClip(kling.video);
          flash(`${"engine" in kling ? kling.engine : "Kling"} hazır.`);
          return;
        }
        setHint("Imagine video deneniyor…");
        const clipRes = await generateClip({
          data: { prompt: text, image: face || undefined, duration: seconds >= 15 ? 15 : 10 },
        });
        if (clipRes.ok && "video" in clipRes && clipRes.video) {
          setClip(clipRes.video);
          flash("Imagine video hazır.");
          return;
        }
        flash(start.error || (!clipRes.ok ? clipRes.error : "Video başlamadı."));
        return;
      }
      let job = start.job;
      let id = start.id;
      for (let i = 0; i < 48; i++) {
        setHint(i < 4 ? "Kuyrukta…" : "Video örülüyor…");
        await new Promise((r) => setTimeout(r, i < 6 ? 4000 : 8000));
        const poll = await pollTalking({ data: { job, id } });
        if (!poll.ok) {
          flash(poll.error || "Video durdu.");
          return;
        }
        if (poll.videoId && job === "session") {
          job = "video";
          id = poll.videoId;
        }
        if (poll.status === "completed" && poll.video) {
          setClip(poll.video);
          flash("Video hazır.");
          return;
        }
      }
      flash("Video uzun sürdü. Biraz sonra tekrar dene.");
    } catch {
      flash("Video ajanı bağlanamadı.");
    } finally {
      setBusy(false);
      setHint("");
    }
  }

  function toggle(id: string) {
    const card = cards.find((c) => c.id === id);
    if (card?.locked) {
      requestPaywall();
      return;
    }
    setPicked((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id].slice(0, 4)));
  }

  function openOne(card: Card) {
    if (card.locked) {
      requestPaywall();
      return;
    }
    createProject(card.name, card.image);
    setTab("studio");
  }

  async function collage() {
    const urls = cards.filter((c) => picked.includes(c.id) && !c.locked).map((c) => c.image);
    if (urls.length < 2) {
      flash("Kolaj için en az 2 kare seç.");
      return;
    }
    for (const url of urls) createProject("Paket", url);
    await makeCollage();
    setTab("studio");
  }

  const drop = useDropFile((f) => void onFaces(f));

  return (
    <div className={cn("relative flex flex-col gap-3 pb-4", drop.over && "is-drop")} {...drop.bind}>
      {busy ? <div className="skel-veil" aria-hidden /> : null}
      <MascotHeader title="10 manzara" line={sky ? `Birkaç fotoğrafınla 10 yer. ${sky}.` : "Birkaç fotoğrafınla 10 farklı yerde görün."} />
      <button type="button" className="oracle-door" onClick={() => setTab("oracle")}>
        <span>{t("fal_title")}</span>
        <em>{t("fal_door")}</em>
      </button>
      <CrystalButton onClick={() => fileRef.current?.click()}>
        {faces.length ? "Fotoğraf ekle" : "1–5 fotoğraf yükle"}
      </CrystalButton>
      <input
        ref={fileRef}
        type="file"
        accept={IMAGE_ACCEPT}
        multiple
        className="sr-only"
        onChange={(e) => void onFaces(e.currentTarget.files)}
      />
      {faces.length ? (
        <div className="face-row">
          {faces.map((src, i) => (
            <button key={i} type="button" className="face-chip" onClick={() => setFaces(faces.filter((_, n) => n !== i))} aria-label="Kaldır">
              <img src={src} alt="" />
            </button>
          ))}
        </div>
      ) : null}
      <CrystalButton disabled={busy || !faces.length} onClick={() => void bakeScenes()}>
        10 manzara üret
      </CrystalButton>
      {busy || hint ? (
        <p className="flex items-center gap-2 text-sm text-muted">
          <Sparkles className="size-4" />
          {hint || "Örülüyor…"}
        </p>
      ) : null}
      {cards.length ? (
        <div className="pack-grid">
          {cards.map((card) => (
            <button
              key={card.id}
              type="button"
              className={cn("pack-card", picked.includes(card.id) && "on", card.locked && "locked")}
              onClick={() => (card.locked ? requestPaywall() : openOne(card))}
            >
              <img src={card.image} alt={card.name} />
              <span>{card.name}</span>
              {card.locked ? (
                <em>
                  <Lock className="size-3" /> PRO
                </em>
              ) : null}
            </button>
          ))}
        </div>
      ) : null}
      {cards.length ? (
        <div className="flex gap-2">
          <CrystalButton
            className="flex-1"
            tone="ghost"
            disabled={!picked.length}
            onClick={() => {
              const card = cards.find((c) => c.id === picked[0] && !c.locked);
              if (card) openOne(card);
            }}
          >
            Stüdyoda aç
          </CrystalButton>
          <CrystalButton className="flex-1" disabled={picked.length < 2} onClick={() => void collage()}>
            Kolaj
          </CrystalButton>
        </div>
      ) : null}
      <label className="flex flex-col gap-1.5">
        <span className="text-xs font-semibold tracking-wide text-muted">Sahne veya konuşma</span>
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.currentTarget.value)}
          rows={3}
          maxLength={900}
          placeholder="Hi, this is my new look. Soft morning light, cream studio."
          className="rounded-2xl bg-inset px-3 py-2.5 text-sm outline-none ring-1 ring-line"
        />
      </label>
      <div className="flex gap-1.5">
        {SECS.map((n) => (
          <button key={n} type="button" className={cn("btn-3d ghost sm", seconds === n && "on")} onClick={() => setSeconds(n)}>
            {n}s
          </button>
        ))}
      </div>
      <div className="flex gap-2">
        <CrystalButton className="flex-1" disabled={busy} onClick={() => void onImagine()}>
          Oluştur
        </CrystalButton>
        <CrystalButton className="flex-1" disabled={busy} onClick={() => void onVideo()}>
          Video
        </CrystalButton>
      </div>
      <div className="engine-row" aria-label="AI motors">
        {(motors.length
          ? motors
          : [
              { id: "flux-2-pro", label: "Flux 2 Pro", on: false },
              { id: "nano-banana", label: "Nano Banana", on: false },
              { id: "imagine", label: "Imagine", on: true },
              { id: "heygen", label: "HeyGen", on: false },
              { id: "kling", label: "Kling", on: false },
            ]
        ).map((m) => (
          <span key={m.id} className={cn("engine-pill", m.on && "on")}>
            {m.label}
          </span>
        ))}
      </div>
      {clip ? (
        <div className="panel overflow-hidden rounded-2xl">
          <video src={clip} controls playsInline className="w-full" poster={face || undefined} />
          <div className="p-2">
            <CrystalButton className="w-full" onClick={() => gatedDownload(clip, "even-ai.mp4")}>
              Videoyu indir
            </CrystalButton>
          </div>
        </div>
      ) : null}
    </div>
  );
}
