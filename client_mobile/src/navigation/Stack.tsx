/**
 * Stack — kaydırmalı kabuğun ÜSTÜNE açılan ekranlar.
 *
 * Üst düzey rotalar yatay kaydırmayla gezilir (`TOP_LEVEL_ROUTES`). Ama
 * bazı ekranlar bir ŞEYDEN açılır: bir profile dokunulur, bir hikaye
 * izlenir, bir sohbet açılır, bir şablon incelenir. Bunlar kaydırma
 * dizisine giremez — dizinin uzunluğu sabittir ve hangi profilin
 * açılacağı çalışma anında belli olur.
 *
 * NEDEN KÜTÜPHANE DEĞİL
 * `@react-navigation` eklemek üç yeni bağımlılık, bir native bağlantı ve
 * kabuğun jest sistemiyle çakışma riski demek. İhtiyaç duyulan tek şey
 * "bir ekranı üste aç, geri gelince kapat" — bu, bir dizi ve iki fonksiyon.
 *
 * GERİ TUŞU BAĞLI
 * Android donanım geri tuşu yığındaki son ekranı kapatır. Bağlanmazsa
 * uygulama kapanır ve kullanıcı akışını kaybeder.
 */
import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';
import { BackHandler } from 'react-native';

/** Yığına itilebilecek ekranlar ve taşıdıkları veri. */
export type StackEntry =
  | { readonly screen: 'profile'; readonly userId: string }
  | { readonly screen: 'story'; readonly authorId: string }
  | { readonly screen: 'chat'; readonly conversationId: string; readonly peerId: string; readonly peerHandle: string }
  | { readonly screen: 'template'; readonly templateId: string }
  | { readonly screen: 'market' }
  | { readonly screen: 'paywall'; readonly reasonKey?: string };

interface StackApi {
  readonly stack: readonly StackEntry[];
  readonly push: (entry: StackEntry) => void;
  readonly pop: () => void;
  readonly reset: () => void;
}

const StackContext = createContext<StackApi | null>(null);

export function StackProvider({ children }: { children: React.ReactNode }): React.JSX.Element {
  const [stack, setStack] = useState<readonly StackEntry[]>([]);

  const push = useCallback((entry: StackEntry) => {
    setStack((current) => [...current, entry]);
  }, []);

  const pop = useCallback(() => {
    setStack((current) => current.slice(0, -1));
  }, []);

  const reset = useCallback(() => setStack([]), []);

  // Android donanım geri tuşu: yığın doluysa son ekranı kapat, boşsa
  // sistemin varsayılan davranışına bırak (uygulamadan çık).
  React.useEffect(() => {
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      if (stack.length === 0) return false;
      pop();
      return true;
    });
    return () => subscription.remove();
  }, [stack.length, pop]);

  const api = useMemo(() => ({ stack, push, pop, reset }), [stack, push, pop, reset]);

  return <StackContext.Provider value={api}>{children}</StackContext.Provider>;
}

/**
 * Yığın API'si.
 *
 * Sağlayıcı dışında çağrılırsa NO-OP döner, fırlatmaz: bir ekranın
 * sağlayıcı dışında test edilmesi, navigasyon yüzünden çökmemelidir.
 */
export function useStack(): StackApi {
  const context = useContext(StackContext);
  return context ?? NOOP_STACK;
}

const NOOP_STACK: StackApi = {
  stack: [],
  push: () => undefined,
  pop: () => undefined,
  reset: () => undefined,
};
