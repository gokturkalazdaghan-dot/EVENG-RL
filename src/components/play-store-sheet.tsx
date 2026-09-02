import { CrystalButton } from "@/components/crystal-button";
import { PLAY, PLAY_SHOTS, tryOpenPlayStore } from "@/lib/play-store";
import { useApp } from "@/lib/store";
import { cn } from "@/lib/utils";
import { ShieldCheck, Smartphone, Star } from "lucide-react";

type Props = {
  mode: "prompt" | "listing";
  onClose: () => void;
  onOpenPaywall?: () => void;
  onShowListing?: () => void;
};

export function PlayStoreSheet({ mode, onClose, onOpenPaywall, onShowListing }: Props) {
  const playInstalled = useApp((s) => s.playInstalled);
  const markPlayInstalled = useApp((s) => s.markPlayInstalled);
  const dismissPlayPrompt = useApp((s) => s.dismissPlayPrompt);

  function openStore() {
    tryOpenPlayStore("listing");
    if (mode === "prompt" && onShowListing) {
      onShowListing();
      return;
    }
    markPlayInstalled();
    onClose();
  }

  function continueWeb() {
    dismissPlayPrompt();
    onClose();
  }

  return (
    <div
      className="absolute inset-0 z-[70] flex flex-col justify-end bg-bg-deep/88 p-4 pb-[max(1.1rem,env(safe-area-inset-bottom))]"
      data-play-sheet={mode}
    >
      <div className="panel-elevated max-h-[92%] overflow-y-auto rounded-[1.85rem] p-4">
        <div className="flex items-start gap-3">
          <img
            src="/media/prism.jpg"
            alt=""
            className="size-16 rounded-2xl object-cover shadow-[0_8px_20px_rgb(4_16_32/0.45)]"
          />
          <div className="min-w-0 flex-1">
            <p className="font-display text-xl font-semibold leading-tight">EVENGIRL</p>
            <p className="text-sm text-crystal">{PLAY.developer}</p>
            <p className="mt-1 text-xs text-muted">
              {PLAY.packageId} · 18+ · Cihazda işler
            </p>
          </div>
        </div>

        <div className="mt-4 flex items-center gap-4 text-sm">
          <span className="flex items-center gap-1 font-semibold">
            <Star className="size-3.5 fill-ember text-ember" />
            4,8
          </span>
          <span className="text-muted">12 B indirme</span>
          <span className="flex items-center gap-1 text-muted">
            <ShieldCheck className="size-3.5 text-crystal" />
            Play Protect
          </span>
        </div>

        <div className="-mx-1 mt-4 flex gap-2 overflow-x-auto pb-1">
          {PLAY_SHOTS.map((shot) => (
            <img
              key={shot.src}
              src={shot.src}
              alt={shot.alt}
              className="h-36 w-24 shrink-0 rounded-2xl object-cover"
            />
          ))}
        </div>

        {mode === "prompt" ? (
          <div className="mt-4 space-y-3">
            <p className="text-sm leading-relaxed text-muted">
              Android sürümü Google Play üzerinden yayınlanır. Satın alma, güncelleme ve
              değerlendirme Play hesabınızla yürür.
            </p>
            <CrystalButton size="xl" tone="azure" onClick={openStore} data-play-install>
              Play Store’dan yükle
            </CrystalButton>
            <CrystalButton tone="ghost" size="lg" onClick={continueWeb}>
              Bu oturumda tarayıcıda devam et
            </CrystalButton>
          </div>
        ) : (
          <div className="mt-4 space-y-3">
            <p className="text-sm leading-relaxed text-muted">
              Fotoğraflar sunucuya gitmez. PRO, Google Play faturalandırmasıyla açılır. iOS
              mağazası bu sürümde yok — önce Android.
            </p>
            {playInstalled ? (
              <CrystalButton size="xl" tone="azure" onClick={onClose}>
                Uygulamayı aç
              </CrystalButton>
            ) : (
              <CrystalButton size="xl" tone="azure" onClick={openStore} data-play-install>
                Yükle
              </CrystalButton>
            )}
            <div className="grid grid-cols-2 gap-2">
              <CrystalButton
                tone="ghost"
                size="md"
                onClick={() => {
                  tryOpenPlayStore("review");
                }}
              >
                Değerlendir
              </CrystalButton>
              <CrystalButton
                tone="ghost"
                size="md"
                onClick={() => {
                  onClose();
                  onOpenPaywall?.();
                }}
              >
                PRO ürünler
              </CrystalButton>
            </div>
            <ul className="space-y-2 text-sm text-muted">
              <li className="flex gap-2">
                <Smartphone className="mt-0.5 size-4 shrink-0 text-azure" />
                Android 8+ · Chrome / TWA
              </li>
              <li className="flex gap-2">
                <ShieldCheck className="mt-0.5 size-4 shrink-0 text-crystal" />
                KVKK: kimlik, konum, reklam kimliği yok
              </li>
            </ul>
            <CrystalButton tone="ghost" size="lg" onClick={onClose}>
              Kapat
            </CrystalButton>
          </div>
        )}

        <p className={cn("mt-3 text-center text-[11px] text-subtle")}>
          market://details?id={PLAY.packageId}
        </p>
      </div>
    </div>
  );
}
