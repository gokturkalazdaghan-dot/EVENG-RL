import { useFastTap } from "@/lib/fast-tap";
import { useApp } from "@/lib/store";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

export function LegalGate() {
  const open = useApp((s) => s.legalOpen);
  const acceptLegal = useApp((s) => s.acceptLegal);
  const lock = useRef(false);
  const tap = useFastTap(() => {
    if (lock.current) return;
    lock.current = true;
    try {
      acceptLegal();
    } catch {
      lock.current = false;
    }
  });

  // HYDRATION: ilk istemci çizimi SUNUCUNUNKİYLE AYNI olmalı.
  //
  // `typeof document === "undefined"` tek başına yetmiyordu. Sunucu bu
  // bileşen için hiçbir şey üretmiyor; istemcinin İLK çizimi ise portalı
  // doğrudan `document.body`ye basıyordu. React ikisini karşılaştırıp
  // "Hydration failed" veriyor ve TÜM AĞACI baştan çiziyordu — ölçüldü,
  // uygulama her açılışta bir kez tamamen yeniden render oluyordu.
  //
  // `mounted`, ilk çizimi sunucununkiyle eşitliyor (ikisi de null); portal
  // ancak hydration bittikten sonra, bir efektte açılıyor.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  if (!mounted || !open || typeof document === "undefined") return null;

  return createPortal(
    <div className="legal-gate" role="dialog" aria-modal="true" aria-labelledby="legal-title">
      <div className="legal-card">
        <p className="legal-kicker">EVENGIRL · 18+</p>
        <h2 id="legal-title">Gizlilik ve yaş</h2>
        <p className="legal-note">
          18 yaşından büyüğüm. Fotoğraflar cihazımda kalır. Kimlik / reklam toplanmaz.
        </p>
        <button type="button" className="legal-go on" {...tap}>
          18+ kabul et, stüdyoya gir
        </button>
      </div>
    </div>,
    document.body,
  );
}
