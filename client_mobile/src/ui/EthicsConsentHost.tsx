/**
 * EthicsConsentHost — etik onayı modalını uygulama ağacına bağlar.
 *
 * `EthicsConsent` saf bir servistir ve UI bilmez; AiEngine ondan onay
 * isteyince bu bileşen modalı gösterir ve kullanıcının kararını Promise
 * olarak geri döndürür. Böylece iş mantığı React'e bağımlı olmadan
 * "onay iste" diyebilir.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';

import { EthicsConsent, type ConsentKind } from '@/ai/engine/EthicsConsent';
import { EthicsDisclaimerScreen } from '@/ui/screens/EthicsDisclaimerScreen';

export function EthicsConsentHost(): React.JSX.Element | null {
  const [pending, setPending] = useState<ConsentKind | null>(null);
  const resolverRef = useRef<((accepted: boolean) => void) | null>(null);

  useEffect(() => {
    EthicsConsent.registerPrompter(
      (kind) =>
        new Promise<boolean>((resolve) => {
          resolverRef.current = resolve;
          setPending(kind);
        }),
    );
  }, []);

  const decide = useCallback((accepted: boolean) => {
    setPending(null);
    // Bekleyen Promise MUTLAKA çözülmeli; aksi halde AiEngine.run() sonsuza
    // kadar bekler ve kullanıcı için araç "takılmış" görünür.
    resolverRef.current?.(accepted);
    resolverRef.current = null;
  }, []);

  if (!pending) return null;

  return <EthicsDisclaimerScreen kind={pending} visible onDecision={decide} />;
}
