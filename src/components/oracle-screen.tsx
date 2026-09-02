import { CrystalButton } from "@/components/crystal-button";
import { PalmMark } from "@/components/palm-mark";
import { SeerGirl } from "@/components/seer-girl";
import { IMAGE_ACCEPT, allowAction, ingestImageFile } from "@/lib/guard";
import { useDropFile } from "@/lib/drop-file";
import { softNote } from "@/lib/soft-note";
import { useLocale, useT } from "@/lib/i18n";
import {
  askOracleNotify,
  clearOracleJob,
  clock,
  loadOracleJob,
  remainMs,
  saveOracleJob,
  waitMs,
  type OracleJob,
} from "@/lib/oracle-job";
import { clearFalHold, loadFalHold, saveFalCups, saveFalDream, saveFalPalm } from "@/lib/fal-hold";
import { readOracle, type OracleKind, type OracleLetter } from "@/lib/oracle";
import { readOracleOnDevice } from "@/lib/oracle-device";
import { withTimeout } from "@/lib/timed";
import { ORACLE_AGENTS } from "@/lib/oracle-canon";
import { fetchSpark } from "@/lib/public-feed";
import { isPro, useApp } from "@/lib/store";
import { cn, requestPaywall, uid } from "@/lib/utils";
import { Coffee, Lock, Send } from "lucide-react";
import { useEffect, useRef, useState } from "react";

const ANGLES = [
  { id: 0, label: "fal_ang_above" as const },
  { id: 1, label: "fal_ang_handle" as const },
  { id: 2, label: "fal_ang_far" as const },
];

const LETTER_KEYS: { k: keyof OracleLetter; label: "fal_seen" | "fal_love" | "fal_path" | "fal_near" }[] = [
  { k: "seen", label: "fal_seen" },
  { k: "love", label: "fal_love" },
  { k: "path", label: "fal_path" },
  { k: "near", label: "fal_near" },
];

function shrink(src: string): Promise<string> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, 880 / Math.max(img.width, img.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(img.width * scale));
      canvas.height = Math.max(1, Math.round(img.height * scale));
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        resolve(src);
        return;
      }
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      resolve(canvas.toDataURL("image/jpeg", 0.82));
    };
    img.onerror = () => resolve(src);
    img.src = src;
  });
}

function nextCupSlot(cups: [string | null, string | null, string | null]) {
  return cups.findIndex((p) => !p);
}

export function OracleScreen() {
  const t = useT();
  const locale = useLocale();
  const flash = useApp((s) => s.flash);
  const pro = isPro(useApp((s) => s.proUntil));
  const birthDate = useApp((s) => s.birthDate);
  const setBirthDate = useApp((s) => s.setBirthDate);
  const fileRef = useRef<HTMLInputElement>(null);
  const slotRef = useRef(0);
  const held = loadFalHold();
  const [plate, setPlate] = useState<"coffee" | "palm">("coffee");
  const [cups, setCups] = useState<[string | null, string | null, string | null]>(held.cups);
  const [palm, setPalm] = useState<string | null>(held.palm);
  const [dream, setDream] = useState(held.dream);
  const [busy, setBusy] = useState(false);
  const [job, setJob] = useState<OracleJob | null>(null);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    setJob(loadOracleJob());
    const id = window.setInterval(() => {
      setNow(Date.now());
      const latest = loadOracleJob();
      if (latest) setJob(latest);
    }, 1000);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => saveFalCups(cups), [cups]);
  useEffect(() => saveFalPalm(palm), [palm]);
  useEffect(() => saveFalDream(dream), [dream]);

  const waiting = Boolean(job && remainMs(job, now) > 0);
  const revealed = Boolean(job && remainMs(job, now) === 0 && job.status === "ready" && job.letter);
  const failed = Boolean(job && remainMs(job, now) === 0 && job.status === "failed");
  const letter = revealed ? job?.letter ?? null : null;
  const cupSlot = nextCupSlot(cups);
  const left = job ? remainMs(job, now) : 0;
  const girlPose: OracleKind = waiting ? job?.kind || plate : plate;
  const waitTotal = job ? Math.max(1, job.readyAt - job.submittedAt) : 1;
  const waitPct = waiting ? Math.min(99, Math.round((1 - left / waitTotal) * 100)) : 0;
  const drop = useDropFile((file) => {
    if (waiting || revealed) return;
    if (plate === "coffee") {
      const slot = nextCupSlot(cups);
      if (slot < 0) {
        flash(t("fal_need_three"));
        return;
      }
      slotRef.current = slot;
    }
    void onFile(file);
  });

  async function onFile(list: FileList | File | null, forceSlot?: number) {
    const file = list instanceof File ? list : list?.[0];
    if (!file) return;
    try {
      const result = await ingestImageFile(file);
      if (!result.ok) {
        softNote("Fotoğraf alınamadı", result.error);
        return;
      }
      const shot = await shrink(result.dataUrl);
      if (plate === "palm") {
        setPalm(shot);
        return;
      }
      setCups((prev) => {
        const idx = forceSlot ?? slotRef.current;
        const slot = idx >= 0 && idx < 3 ? idx : nextCupSlot(prev);
        if (slot < 0) return prev;
        const next = [...prev] as [string | null, string | null, string | null];
        next[slot] = shot;
        return next;
      });
    } catch {
      softNote("Fotoğraf alınamadı", "Ağ veya dosya hatası. Başka bir kare dene.");
    }
  }

  function openPlate() {
    if (waiting || revealed) return;
    if (plate === "palm") {
      slotRef.current = 0;
      fileRef.current?.click();
      return;
    }
    const slot = nextCupSlot(cups);
    if (slot < 0) {
      flash(t("fal_need_three"));
      return;
    }
    slotRef.current = slot;
    fileRef.current?.click();
  }

  function fresh() {
    clearOracleJob();
    setJob(null);
    setCups([null, null, null]);
    setPalm(null);
    setDream("");
    setBusy(false);
    clearFalHold();
  }

  async function send(kind: OracleKind) {
    if (!pro) {
      requestPaywall();
      flash(t("fal_need_pro"));
      return;
    }
    if (job && remainMs(job) > 0) {
      flash(t("fal_busy_job"));
      return;
    }
    if (kind === "coffee" && cups.some((p) => !p)) {
      flash(t("fal_need_three"));
      return;
    }
    if (kind === "palm" && !palm) {
      flash(t("fal_need_photo"));
      return;
    }
    if (kind === "dream" && dream.trim().length < 12) {
      flash(t("fal_need_dream"));
      return;
    }
    if (!allowAction("fal", 3, 10 * 60_000)) {
      flash(t("fal_busy_job"));
      return;
    }
    askOracleNotify();
    const next: OracleJob = {
      id: uid("fal"),
      kind,
      submittedAt: Date.now(),
      readyAt: Date.now() + waitMs(kind),
      status: "waiting",
    };
    saveOracleJob(next);
    setJob(next);
    setBusy(true);
    void fetchSpark().then((spark) => {
      const latest = loadOracleJob();
      if (!latest || latest.id !== next.id) return;
      const withSpark = { ...latest, spark };
      saveOracleJob(withSpark);
      setJob(withSpark);
    });
    const images =
      kind === "coffee" ? (cups.filter(Boolean) as string[]) : kind === "palm" && palm ? [palm] : [];
    try {
      /**
       * ÖNCE SUNUCU, OLMAZSA CİHAZ.
       *
       * `readOracle` XAI_API_KEY ister; anahtar tanımlı değilse tek satır
       * dönüyordu ("Reading is closed right now.") ve kahve falı, el falı,
       * rüya tabirinin ÜÇÜ BİRDEN ölüydü — PRO ile satılan ana özellik.
       *
       * CLAUDE.md kuralı: "always keep on-device fallback." Cihaz üstü
       * okuyucu fotoğrafı gerçekten ölçüyor (telve yoğunluğu, en büyük
       * lekenin konumu ve biçimi, boşluk; avuçta bölgesel çizgi
       * yoğunluğu ve süreklilik) ve geleneksel külliyattan uyan şıkkı
       * seçiyor. Rastgele metin ÜRETMİYOR.
       *
       * Sunucu ağ hatası verirse de buraya düşülüyor: kullanıcının
       * fincanı elinde kalmasın diye.
       */
      let res = await withTimeout<{ ok: true; letter: OracleLetter } | { ok: false; error: string }>(
        readOracle({
          data: { kind, locale, images, dream: kind === "dream" ? dream : undefined, birthDate },
        }),
        60_000,
      ).catch(() => ({ ok: false as const, error: "" }));

      if (!res.ok) {
        const local = await readOracleOnDevice({
          kind,
          images,
          dream: kind === "dream" ? dream : undefined,
          birthDate,
        });
        // Cihaz da okuyamadıysa ONUN sebebi gösteriliyor: "üç açı gerekli",
        // "avuçta çizgi seçilmedi" gibi mesajlar kullanıcıya ne yapacağını
        // söyler; sunucunun genel "kapalı" mesajı söylemez.
        res = local;
      }
      const latest = loadOracleJob();
      if (!latest || latest.id !== next.id) return;
      const done: OracleJob = res.ok
        ? { ...latest, status: "ready", letter: res.letter }
        : { ...latest, status: "failed", error: res.error || t("fal_fail") };
      saveOracleJob(done);
      setJob(done);
    } catch (e) {
      const latest = loadOracleJob();
      if (!latest || latest.id !== next.id) return;
      const msg = (e as Error)?.message || t("fal_fail");
      const done: OracleJob = { ...latest, status: "failed", error: msg };
      saveOracleJob(done);
      setJob(done);
      softNote(t("fal_title"), msg);
    } finally {
      setBusy(false);
    }
  }

  const preview = plate === "palm" ? palm : cups[Math.max(0, cupSlot < 0 ? 2 : cupSlot)];

  return (
    <div className="oracle">
      <header className="oracle-head">
        <p className="oracle-kicker">{t("fal_kicker")}</p>
        <h1>{t("fal_title")}</h1>
        <p className="oracle-line">
          <Coffee className="oracle-head-ico" strokeWidth={2.2} />
          <PalmMark className="oracle-head-ico" />
          <span>{t("fal_line")}</span>
        </p>
      </header>

      <div className={cn("oracle-split", waiting && "is-wait", revealed && "is-read")}>
        <section className={cn("oracle-pane photo", drop.over && "is-drop")} {...drop.bind}>
          <div className="oracle-pane-toggle">
            <button type="button" className={cn(plate === "coffee" && "on")} disabled={waiting} onClick={() => setPlate("coffee")}>
              {t("fal_coffee")}
            </button>
            <button type="button" className={cn(plate === "palm" && "on")} disabled={waiting} aria-label={t("fal_palm")} onClick={() => setPlate("palm")}>
              <PalmMark className="oracle-palm-ico" />
              <span>{t("fal_palm_mark")}</span>
            </button>
          </div>

          <SeerGirl pose={girlPose} waiting={waiting} />
          {preview && !waiting && !revealed ? <img className="oracle-shot" src={preview} alt="" /> : null}
          {plate === "coffee" && !waiting && !revealed ? (
            <ol className="fal-steps">
              {ANGLES.map((a, i) => (
                <li key={a.id} className={cn(cups[i] && "done", cupSlot === i && "on")}>
                  <button
                    type="button"
                    disabled={waiting}
                    onClick={() => {
                      slotRef.current = i;
                      fileRef.current?.click();
                    }}
                  >
                    <b>{i + 1}</b>
                    <span>{t(a.label)}</span>
                  </button>
                </li>
              ))}
            </ol>
          ) : null}

          {waiting ? (
            <div className="oracle-timer">
              <p className="oracle-agent">{ORACLE_AGENTS[job?.kind || plate].name}</p>
              <strong>{clock(left)}</strong>
              <span className="fal-meter" aria-hidden>
                <i style={{ width: `${waitPct}%` }} />
              </span>
              {/* Bekleme sırasında da kitap adı dönmüyor (bkz. yukarıdaki not). */}
            </div>
          ) : null}
        </section>

        {waiting ? (
          <div className="oracle-dock is-wait">
            <p className="oracle-dock-wait">{t("fal_wait")}</p>
          </div>
        ) : (
        <div className="oracle-dock">
          {/*
            DOĞUM TARİHİ — okumayı kişiye bağlayan tek girdi.
            KİMLİK BİLGİSİ İSTENMİYOR: ad, e-posta, telefon yok. Tarih
            cihazda kalır, hiçbir yere gönderilmez. Boş bırakılabilir —
            o zaman okuma yalnızca külliyattan gelir.
          */}
          {!revealed ? (
            <label className="oracle-birth">
              <span className="oracle-birth-label">{t("fal_birth")}</span>
              <input
                type="date"
                className="oracle-birth-input"
                value={birthDate}
                max={new Date().toISOString().slice(0, 10)}
                min="1900-01-01"
                disabled={waiting}
                onChange={(e) => setBirthDate(e.target.value)}
              />
              <span className="oracle-birth-hint">{t("fal_birth_hint")}</span>
            </label>
          ) : null}
          {revealed ? (
            <CrystalButton className="oracle-mid-send" onClick={fresh}>
              {t("fal_new")}
            </CrystalButton>
          ) : (
            <>
              <button type="button" className="oracle-shot-btn" disabled={waiting} onClick={openPlate}>
                {plate === "palm" ? <PalmMark className="size-4" /> : <Coffee className="size-4" />}
                <span>{plate === "palm" ? t("fal_palm_girl") : t("fal_cup_cta")}</span>
                {plate === "coffee" ? <em>{cupSlot < 0 ? "3/3" : `${Math.max(1, cupSlot + 1)}/3`}</em> : null}
              </button>
              <CrystalButton className="oracle-mid-send" disabled={busy || waiting} onClick={() => void send(plate)}>
                {busy && job?.kind !== "dream" ? t("fal_reading") : t("fal_send")}
                {!pro ? <Lock className="ml-1 size-3.5" /> : null}
              </CrystalButton>
            </>
          )}
        </div>
        )}

        <section className="oracle-pane chat">
          <p className="oracle-chat-label">{t("fal_dream")}</p>
          {waiting && job?.kind === "dream" && dream.trim() ? (
            <p className="oracle-bubble">{dream.trim()}</p>
          ) : null}
          <div className="oracle-chat">
            <textarea
              rows={1}
              maxLength={900}
              value={dream}
              disabled={waiting}
              placeholder={t("fal_chat_ph")}
              enterKeyHint="send"
              onFocus={(e) => {
                const el = e.currentTarget;
                window.setTimeout(() => {
                  el.scrollIntoView({ block: "center", behavior: "smooth" });
                }, 280);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  void send("dream");
                }
              }}
              onChange={(e) => {
                setDream(e.target.value);
                const el = e.currentTarget;
                el.style.height = "auto";
                el.style.height = `${Math.min(el.scrollHeight, 120)}px`;
              }}
            />
            <button type="button" className="oracle-chat-send" disabled={waiting || busy} onClick={() => void send("dream")} aria-label={t("fal_send")}>
              <Send className="size-4" strokeWidth={2.3} />
            </button>
          </div>
        </section>
      </div>

      <input ref={fileRef} type="file"
        aria-label={t("photo_pick")} accept={IMAGE_ACCEPT} className="sr-only" onChange={(e) => void onFile(e.currentTarget.files)} />

      {failed ? <p className="oracle-hint">{job?.error || t("fal_fail")}</p> : null}

      {letter ? (
        <article className="oracle-letter">
          <p className="oracle-omen">{letter.omen}</p>
          <h2>{letter.title}</h2>
          {/*
            HUY BÖLÜMÜ — kişiye oturan kısım.
            Doğum tarihi girilmemişse `character` boş gelir ve bu bölüm
            hiç çıkmaz. Uydurma bir huy tarifi yazmıyoruz.
          */}
          {letter.character ? (
            <section className="oracle-fade oracle-character">
              <h3>{t("fal_character")}</h3>
              <p>{letter.character}</p>
            </section>
          ) : null}
          {LETTER_KEYS.map((row) =>
            letter[row.k] ? (
              <section key={row.k} className="oracle-fade">
                <h3>{t(row.label)}</h3>
                <p>{letter[row.k]}</p>
              </section>
            ) : null,
          )}
          {/*
            KAYNAK LİSTESİ GÖSTERİLMİYOR — ürün kararı.
            Okuma gerçekten kadim külliyata dayanıyor ve hangi kitaplara
            dayandığı `letter.sources` içinde KAYITTA duruyor; ama ekranda
            kitap adı dizmek falcının ağzından çıkacak bir şey değil ve
            okumanın sadeliğini bozuyor.
          */}
          {job?.spark?.tarot ? (
            <p className="oracle-src">
              Kart · {job.spark.tarot}
              {job.spark.meaning ? ` — ${job.spark.meaning}` : ""}
            </p>
          ) : null}
          {job?.spark?.glow ? <p className="oracle-bubble">{job.spark.glow}</p> : null}
        </article>
      ) : null}

      <p className="oracle-note">{t("fal_note")}</p>
    </div>
  );
}
