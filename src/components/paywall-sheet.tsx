import { CrystalButton } from "@/components/crystal-button";
import { CrystalMark } from "@/components/crystal-mark";
import { PLAY, PLAY_SKUS, skuById, type PlaySku } from "@/lib/play-store";
import { flushPendingDownload } from "@/lib/download";
import { isPro, useApp } from "@/lib/store";
import type { CrystalId } from "@/lib/types";
import { cn } from "@/lib/utils";
import { Download, Lock, ShieldCheck } from "lucide-react";
import { useState } from "react";

type Props = {
  onClose: () => void;
};

export function PaywallSheet({ onClose }: Props) {
  const proUntil = useApp((s) => s.proUntil);
  const purchasePlaySku = useApp((s) => s.purchasePlaySku);
  const crystalId = useApp((s) => s.crystalId as CrystalId | null);
  const setCrystalId = useApp((s) => s.setCrystalId);
  const [sku, setSku] = useState<PlaySku>("monthly");
  const identity: CrystalId = "girl";
  const [phase, setPhase] = useState<"pick" | "billing" | "done">(
    isPro(proUntil) ? "done" : "pick",
  );
  const selected = skuById(sku);
  const pro = isPro(proUntil);

  function finish() {
    onClose();
    if (isPro(useApp.getState().proUntil)) flushPendingDownload();
  }

  /**
   * GERÇEK satın alma akışı.
   *
   * Eskiden 900 ms sahte bekleme sonrası PRO açılıyordu — Play'e hiç
   * gidilmiyordu. Artık `purchasePlaySku` BillingClient köprüsüne gidiyor
   * ve `false` dönerse ekran "pick"e geri düşüyor; kullanıcı neden
   * olmadığını flash mesajında görüyor. Sahte bekleme kaldırıldı: gerçek
   * akışın kendi süresi var ve Play kendi ekranını açıyor.
   */
  function buy() {
    if (phase !== "pick") return;
    setCrystalId("girl");
    setPhase("billing");
    void (async () => {
      const ok = await purchasePlaySku(sku);
      if (ok) {
        setCrystalId("girl");
        setPhase("done");
      } else {
        setPhase("pick");
      }
    })();
  }

  return (
    <div className="paywall-screen" data-paywall data-pay-phase={phase} role="dialog" aria-modal="true" aria-label="EVENGIRL PRO">
      {phase === "pick" ? (
        <>
          <div className="paywall-body">
          <p className="pay-play-chip">
            <ShieldCheck className="size-3.5" />
            Google Play · EVENGIRL PRO
          </p>
          <h2 className="font-display neon-title mt-3 text-[1.85rem] font-semibold leading-none tracking-tight">EVENGIRL PRO</h2>
          <p className="mt-2 text-sm leading-relaxed text-muted">
            Tenin cam, bakışın mücevher. PRO ile her look sende kalır — galeriye kaydet, 10 manzarada parla.
          </p>

          <p className="mt-5 mb-2 text-center text-[11px] font-semibold tracking-[0.16em] text-crystal uppercase">Senin kristalin</p>
          <div className="crystal-solo">
            <div className="crystal-pick on girl neon-ring" data-crystal="girl" aria-label="EVENGIRL">
              <CrystalMark id="girl" size="lg" />
            </div>
          </div>

          <ul className="pay-perks">
            <li>
              <Lock className="size-4 shrink-0 text-azure" />
              <span>HD indirme ve ışıltılı look’lar yalnızca PRO’da açılır.</span>
            </li>
            <li>
              <Download className="size-4 shrink-0 text-azure" />
              <span>10 manzara, video ve kristal kimlik senin olur.</span>
            </li>
          </ul>

          <div className="mt-4 flex flex-col gap-2">
            {PLAY_SKUS.map((item) => {
              const on = item.id === sku;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setSku(item.id)}
                  className={cn("pay-sku", on && "on")}
                  aria-pressed={on}
                >
                  <div className="flex items-baseline justify-between gap-3">
                    <p className="font-display font-semibold">{item.title}</p>
                    <p className="font-semibold tabular-nums text-azure">{item.price}</p>
                  </div>
                  <p className="mt-1 text-xs text-muted">
                    {item.period} · {item.note}
                  </p>
                </button>
              );
            })}
          </div>
          {pro ? <p className="mt-3 text-sm text-crystal">PRO açık. Yenilemek için Play’e gidin.</p> : null}
          </div>
          <div className="paywall-foot">
          <CrystalButton size="xl" tone="azure" className="neon-buy" onClick={buy} data-play-buy disabled={phase !== "pick"}>
            Işıltını aç · PRO
          </CrystalButton>
          <p className="flex items-center justify-center gap-1.5 text-[11px] text-subtle">
            <ShieldCheck className="size-3.5" />
            Otomatik yenilenir · Play Store › Ödemeler
          </p>
          <CrystalButton tone="ghost" size="lg" onClick={onClose}>
            Şimdi değil
          </CrystalButton>
          </div>
        </>
      ) : null}

      {phase === "billing" ? (
        <div className="flex flex-1 flex-col items-center justify-center py-8 text-center">
          {identity ? <CrystalMark id="girl" size="lg" /> : null}
          <p className="font-display mt-5 text-xl font-semibold">Google Play</p>
          <p className="mt-1 text-sm text-muted">
            {selected.title} · {selected.price}
          </p>
          <span className="splash-track mt-6 w-44">
            <span className="splash-fill" />
          </span>
          <p className="mt-4 text-xs text-subtle">Play Faturalandırma onaylıyor…</p>
        </div>
      ) : null}

      {phase === "done" ? (
        <div className="flex flex-1 flex-col items-center justify-center py-6 text-center">
          {identity ? <CrystalMark id="girl" size="lg" burst /> : null}
          <p className="font-display neon-title mt-5 text-[1.85rem] font-semibold leading-none">
            EVENGIRL
          </p>
          <p className="mt-3 max-w-[18rem] text-sm leading-relaxed text-muted">
            Kristalin yandı. Artık her kare senin — indir, paylaş, parla.
          </p>
          <CrystalButton size="xl" tone="azure" className="mt-6" onClick={finish} data-pay-done>
            İndirmeye geç
          </CrystalButton>
        </div>
      ) : null}
    </div>
  );
}
