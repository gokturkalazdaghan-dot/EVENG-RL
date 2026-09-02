import { CrystalButton } from "@/components/crystal-button";
import { ArmanaCredit } from "@/components/feedback-sheet";
import { CrystalSwitch } from "@/components/ui/switch";
import { emitEven, isNativeApp, PLAY } from "@/lib/play-store";
import { useApp } from "@/lib/store";
import { cn, FEEDBACK_MAIL, LEGAL_PRIVACY, LEGAL_TERMS, openFeedbackMail, openLegalPdf } from "@/lib/utils";
import { useState } from "react";

export function SettingsScreen() {
  const crashReports = useApp((s) => s.crashReports);
  const adultContent = useApp((s) => s.adultContent);
  const setCrashReports = useApp((s) => s.setCrashReports);
  const setAdultContent = useApp((s) => s.setAdultContent);
  const setTab = useApp((s) => s.setTab);
  const wipeLocal = useApp((s) => s.wipeLocal);
  const playInstalled = useApp((s) => s.playInstalled);
  const feedbacks = useApp((s) => s.feedbacks);
  const flash = useApp((s) => s.flash);
  const [doc, setDoc] = useState<"gizlilik" | "kvkk" | "saglik" | "magaza" | null>(null);
  const [wipeAsk, setWipeAsk] = useState(false);

  return (
    <div className="flex flex-col gap-4 pb-8">
      <h1 className="font-display text-[1.35rem] font-semibold tracking-tight">Ayarlar</h1>

      <section className="panel rounded-3xl p-4">
        <h2 className="font-display text-lg font-semibold">
          {isNativeApp() ? "Android uygulaması" : "Google Play"}
        </h2>
        <p className="mt-1 text-sm leading-relaxed text-muted">
          {isNativeApp()
            ? `Yüklü paket ${PLAY.packageId}. Fotoğraf bu cihazda kalır. PRO satın alma Play Faturalandırma ile yürür.`
            : "Android yayını önce Play Store’da. PRO satın alma Play Faturalandırma ile yürür."}
        </p>
        <CrystalButton
          size="lg"
          tone="azure"
          className="mt-4"
          onClick={() => emitEven("play")}
        >
          {isNativeApp() || playInstalled ? "Play Store sayfası" : "Play Store’dan yükle"}
        </CrystalButton>
        <CrystalButton tone="ghost" size="md" className="mt-2 w-full" onClick={() => emitEven("paywall")}>
          PRO paketleri
        </CrystalButton>
      </section>

      <section className="panel rounded-3xl p-4">
        <h2 className="font-display text-lg font-semibold">Gizlilik</h2>
        <div className="mt-3 flex flex-col gap-1">
          <CrystalSwitch
            checked={crashReports}
            onCheckedChange={setCrashReports}
            label="Anonim çökme günlüğü"
          />
          <p className="text-xs text-subtle">Görsel eklenmez. Bu sürümde ağ kanalı kapalıdır.</p>
          <CrystalSwitch
            checked={adultContent}
            onCheckedChange={setAdultContent}
            label="Yetişkin içerik"
          />
        </div>
      </section>

      <section className="panel rounded-2xl px-4 py-3.5">
        <p className="text-sm leading-relaxed text-muted">
          Hesap yok. E-posta, telefon veya isim istenmez. Fotoğraflar sunucuya gitmez. Galeri yalnızca
          sizin seçtiğiniz anda, tarayıcının dosya seçicisiyle okunur.
        </p>
      </section>

      <div className="flex flex-col gap-2">
        {(
          [
            ["gizlilik", "Gizlilik bildirimi"],
            ["kvkk", "KVKK / veri güvenliği"],
            ["saglik", "Rötuş sınırları"],
            ["magaza", "Mağaza beyanı"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => setDoc(doc === id ? null : id)}
            className="panel flex min-h-12 items-center justify-between rounded-2xl px-4 text-left"
          >
            <span className="text-sm font-medium">{label}</span>
            <span className="text-sm text-crystal">{doc === id ? "Kapat" : "Oku"}</span>
          </button>
        ))}
      </div>

      {doc === "gizlilik" ? (
        <article className="panel rounded-2xl p-4 text-sm leading-relaxed text-muted">
          EVENGIRL fotoğrafı yalnızca seçtiğiniz anda, tarayıcınızın belleğinde işler. Yüz tanıma bulutu,
          reklam kimliği ve konum yoktur. Mağaza incelemesi için: kullanıcı başlatır, veri yurtdışına
          çıkmaz, çocuk verisi toplanmaz (18+).
        </article>
      ) : null}
      {doc === "kvkk" ? (
        <article className="panel rounded-2xl p-4 text-sm leading-relaxed text-muted">
          6698 sayılı KVKK kapsamında veri sorumlusu sizsiniz — projeler bu cihazın yerel deposundadır.
          Silmek için aşağıdaki “Yerel veriyi sil” veya tarayıcı verisini temizleyin. Üçüncü taraf SDK,
          izleyici veya satın alma kimliği bağlı değildir. PRO ödemesi Google Play’e aittir.
        </article>
      ) : null}
      {doc === "saglik" ? (
        <article className="panel rounded-2xl p-4 text-sm leading-relaxed text-muted">
          Hacim ve çene araçları ılımlıdır (azami yüzde 55). Tıbbi tanı, cerrahi simülasyon veya yeme
          bozukluğuna yol açabilecek aşırı incelme vaat edilmez. Yaşlandırma, cinsiyet değiştirme veya
          başka bir gerçek kişinin suretini taklit etmek yoktur.
        </article>
      ) : null}
      {doc === "magaza" ? (
        <article className="panel rounded-2xl p-4 text-sm leading-relaxed text-muted">
          Yaş: 18+. Paket: com.evenaistudio.app. Safe Mode varsayılan açık. Fotoğraflar cihazda
          işlenir, yüklenmez. Çökme günlüğü kapalı ve görsel taşımaz. Takip, reklam kimliği, arka plan
          konumu yok. EVENGIRL bağımsız bir stüdyodur. Android önce; iOS sonraki dalga.
        </article>
      ) : null}

      <button
        type="button"
        onClick={() => setTab("storage")}
        className={cn("panel flex min-h-14 items-center justify-between rounded-2xl px-4 text-left")}
      >
        <span className="text-sm font-medium">Depolama</span>
        <span className="text-sm text-crystal">Yönet</span>
      </button>

      {wipeAsk ? (
        <div className="panel-elevated rounded-3xl p-4">
          <p className="text-sm text-muted">Projeler bu tarayıcıdan silinir. Geri alınamaz.</p>
          <div className="mt-3 flex gap-2">
            <CrystalButton tone="ghost" className="flex-1" onClick={() => setWipeAsk(false)}>
              Vazgeç
            </CrystalButton>
            <CrystalButton
              tone="orange"
              className="flex-1"
              onClick={() => {
                wipeLocal();
                setWipeAsk(false);
              }}
            >
              Sil
            </CrystalButton>
          </div>
        </div>
      ) : (
        <CrystalButton tone="ghost" size="lg" onClick={() => setWipeAsk(true)}>
          Yerel veriyi sil
        </CrystalButton>
      )}

      <section className="panel rounded-3xl p-4">
        <h2 className="font-display text-lg font-semibold">Politikalar</h2>
        <p className="mt-1 text-sm leading-relaxed text-muted">
          Hesap yok. Kişisel bilgi kaydı yok. Reklam yok. Gizlilik had safhada.
        </p>
        <CrystalButton size="lg" tone="azure" className="mt-4 w-full" onClick={() => openLegalPdf(LEGAL_TERMS)}>
          Kullanıcı politikası
        </CrystalButton>
        <CrystalButton size="lg" tone="ghost" className="mt-2 w-full" onClick={() => openLegalPdf(LEGAL_PRIVACY)}>
          Gizlilik politikası
        </CrystalButton>
      </section>

      <section className="panel rounded-3xl p-4">
        <h2 className="font-display text-lg font-semibold">Geri bildirim</h2>
        <p className="mt-1 text-sm leading-relaxed text-muted">
          Hata, istek veya şikayet {FEEDBACK_MAIL} adresine e-posta olarak gider.
        </p>
        <CrystalButton
          size="lg"
          tone="azure"
          className="mt-4 w-full"
          onClick={() => {
            openFeedbackMail("geri");
            flash(`${FEEDBACK_MAIL} adresine yönlendirildi`);
          }}
        >
          Geri bildirim
        </CrystalButton>
        {feedbacks.length ? (
          <p className="mt-2 text-xs text-subtle">Kayıtlı ileti: {feedbacks.length}</p>
        ) : null}
      </section>

      <div className="mt-6 flex justify-center pb-6" data-armanalabs>
        <ArmanaCredit />
      </div>
    </div>
  );
}
