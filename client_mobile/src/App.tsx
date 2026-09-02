/**
 * App — uygulama kökü.
 *
 * AÇILIŞ SIRASI
 *   1. SecurityGate.verify()  — bütünlük kontrolü. Başarısızsa hiçbir şey
 *      monte edilmez; editör, ağ istemcisi ve ödeme katmanı hiç oluşturulmaz.
 *   2. AppLifecycle.start()   — termal izleme, dizin hazırlığı, arka plan bakımı.
 *   3. Kaydırmalı kabuk monte edilir.
 *
 * Uygulama ön plana her döndüğünde güvenlik kontrolü TEKRARLANIR: arka
 * plandayken cihaza debugger bağlanmış olabilir.
 */
import React, { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AppState, StyleSheet, Text, View, type AppStateStatus } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { useSharedValue } from 'react-native-reanimated';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';

import { AgeGate } from '@/age/AgeGate';
import type { AccessTier } from '@/age/AgePolicy';
import { AppLifecycle } from '@/core/lifecycle/AppLifecycle';
import { GestureShell } from '@/navigation/GestureShell';
import { StackProvider, useStack } from '@/navigation/Stack';
import { StackHost } from '@/navigation/StackHost';
import { INITIAL_ROUTE_INDEX, TOP_LEVEL_ROUTES, type TopLevelRoute } from '@/navigation/routes';
import { currentVersion, type Project } from '@/projects/ProjectModel';
import { ProjectSession } from '@/projects/ProjectSession';
import { CaptureShieldHost } from '@/security/CaptureShieldHost';
import { SecurityGate, type GateState } from '@/security/SecurityGate';
import { EthicsConsentHost } from '@/ui/EthicsConsentHost';
import { PageIndicator } from '@/ui/components/PageIndicator';
import { ThemeProvider, useTheme } from '@/ui/theme/ThemeProvider';
import { spacing, radius, typography } from '@/ui/theme/tokens';
import { EditorScreen } from '@/ui/screens/EditorScreen';
import { ProjectsScreen } from '@/ui/screens/ProjectsScreen';
import { AgeGateScreen } from '@/ui/screens/AgeGateScreen';
import { FeedScreen } from '@/ui/screens/FeedScreen';
import {
  OnboardingShowcaseScreen,
  hasSeenShowcase,
} from '@/ui/screens/OnboardingShowcaseScreen';
import { LeaderboardScreen } from '@/ui/screens/LeaderboardScreen';
import { SafeModeNoticeScreen } from '@/ui/screens/SafeModeNoticeScreen';
import { SecurityBlockedScreen } from '@/ui/screens/SecurityBlockedScreen';
import { SecurityCheckScreen } from '@/ui/screens/SecurityCheckScreen';
import { SettingsScreen } from '@/ui/screens/SettingsScreen';
import { StorageScreen } from '@/ui/screens/StorageScreen';

export default function App(): React.JSX.Element {
  const { t, i18n } = useTranslation();
  const [gate, setGate] = useState<GateState>(SecurityGate.current);
  /** Paywall isteği sayacı — her artış yeni bir açma isteğidir. */
  const [paywallRequest, setPaywallRequest] = useState(0);
  const [captureNotice, setCaptureNotice] = useState<string | null>(null);

  /**
   * i18n HAZIR MI.
   *
   * `initI18n()` `AppLifecycle.start()` içinde ve dosya sistemi hazırlığından
   * SONRA çalışıyor. Ağaç bunu beklemeden monte edilirse, react-i18next
   * başlatılmamış bir örnek görür ve `t('age.title')` çeviri yerine
   * ANAHTARIN KENDİSİNİ döndürür: kullanıcı soğuk açılışta bir an
   * "age.title" yazısı görür. i18n modülünün ilkesi tam tersini söylüyor —
   * anahtar adı asla kullanıcıya gösterilmez.
   *
   * i18next kendi `initialized` olayını yayıyor; ayrı bir bayrak tutmak
   * (ve onu senkron tutmayı unutmak) yerine o dinleniyor.
   */
  const [i18nReady, setI18nReady] = useState(i18n.isInitialized);

  useEffect(() => {
    if (i18n.isInitialized) {
      setI18nReady(true);
      return;
    }
    const onInitialized = (): void => setI18nReady(true);
    i18n.on('initialized', onInitialized);
    return () => {
      i18n.off('initialized', onInitialized);
    };
  }, [i18n]);

  useEffect(() => SecurityGate.subscribe(setGate), []);

  const runCheck = useCallback(() => {
    void SecurityGate.verify();
  }, []);

  useEffect(() => {
    runCheck();

    const subscription = AppState.addEventListener('change', (next: AppStateStatus) => {
      if (next === 'active') runCheck();
    });
    return () => subscription.remove();
  }, [runCheck]);

  // Yaşam döngüsü YALNIZCA kontrol geçtikten sonra başlar: kilitli bir
  // uygulamada dosya sistemi taraması ve termal izleme çalıştırmanın anlamı yok.
  useEffect(() => {
    if (gate.status !== 'passed') return;
    void AppLifecycle.start();
    return () => AppLifecycle.stop();
  }, [gate.status]);

  // Yakalama kalkanı da kontrol geçtikten SONRA başlar ama ağacın en
  // üstünde: kalkan bir ekranın içine bağlanırsa, o ekran görünür değilken
  // yakalama olayları dinlenmez.
  useEffect(() => {
    if (gate.status !== 'passed') return;

    CaptureShieldHost.start({
      openPaywall: () => setPaywallRequest((n) => n + 1),
      notify: (key) => setCaptureNotice(key),
      // Metinler burada çevrilir; native taraf 9. bir dil kaynağı tutmaz.
      gateStrings: () => ({
        title: t('export.capture.gateTitle'),
        body: t('export.capture.gateBody'),
        actionTitle: t('export.capture.gateAction'),
      }),
    });
    return () => CaptureShieldHost.stop();
  }, [gate.status, t]);

  // Dil değiştiğinde kalkan metinleri native tarafa yeniden iletilir —
  // kalkan görünürken bile.
  useEffect(() => {
    CaptureShieldHost.pushGateStrings();
  }, [i18n.language]);

  // Bu iki ekran BİLEREK çevirisizdir (bkz. i18n/index.ts, ilke 1): çeviri
  // yüklemesi başarısız olsa bile güvenlik kilidi görünmelidir.
  if (gate.status === 'pending') return <SecurityCheckScreen />;
  if (gate.status === 'blocked') return <SecurityBlockedScreen onRetry={runCheck} />;

  // Kontrol geçti ama çeviriler henüz yüklenmedi: aynı marka rengi yüzey
  // gösteriliyor. Bir kare boyunca ham anahtar göstermektense, zaten
  // görünmekte olan yükleme yüzeyini bir kare daha tutmak doğrudur.
  if (!i18nReady) return <SecurityCheckScreen />;

  return (
    // GestureHandlerRootView tüm ağacı sarmalı; aksi halde jestler Android'de
    // sessizce çalışmaz (en sık karşılaşılan RN kurulum hatası).
    <GestureHandlerRootView style={styles.fill}>
      <SafeAreaProvider>
        <ThemeProvider>
          <StackProvider>
            <AgeGatedApp paywallRequest={paywallRequest} />
            {/* Yığın kabuğun ÜSTÜNDE: profil, hikaye, sohbet, şablon ve
                pazar ekranları buradan açılır. */}
            <StackHost />
          </StackProvider>
          {captureNotice ? (
            <CaptureNotice
              i18nKey={captureNotice}
              onDismiss={() => setCaptureNotice(null)}
            />
          ) : null}
          {/* Etik onayı modalı, hangi ekranda olunursa olunsun görünmeli;
              bu yüzden kabuğun dışında, ağacın en üstünde duruyor. */}
          <EthicsConsentHost />
        </ThemeProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

/**
 * Yaş kapısı katmanı.
 *
 * Kapı geçilmeden uygulama kabuğu MONTE EDİLMEZ. Kısa bir an bile olsa akışı
 * göstermek, tam olarak engellemeye çalıştığımız şeydir.
 *
 * Safe Mode'a düşen kullanıcıya neyin değiştiği bir kez anlatılır; sessizce
 * kısıtlamak, kullanıcının eksik özelliği arıza sanmasına yol açar.
 */
function AgeGatedApp({ paywallRequest }: { paywallRequest: number }): React.JSX.Element {
  const [tier, setTier] = useState<AccessTier>(AgeGate.current);
  const [loading, setLoading] = useState(true);
  const [safeModeAcknowledged, setSafeModeAcknowledged] = useState(false);
  const [showcaseDone, setShowcaseDone] = useState(hasSeenShowcase);

  useEffect(() => AgeGate.subscribe(setTier), []);

  useEffect(() => {
    void AgeGate.load().finally(() => setLoading(false));
  }, []);

  const handleVerified = useCallback(() => {
    // Kademe AgeGate üzerinden abonelikle zaten geliyor; burada yalnızca
    // Safe Mode bildiriminin yeniden gösterilmesini sağlıyoruz.
    setSafeModeAcknowledged(false);
  }, []);

  if (loading) return <SecurityCheckScreen />;
  if (tier === 'unverified') return <AgeGateScreen onVerified={handleVerified} />;
  if (tier === 'safe' && !safeModeAcknowledged) {
    return <SafeModeNoticeScreen onAcknowledge={() => setSafeModeAcknowledged(true)} />;
  }

  // İlk açılış PRO vitrini — yaş kapısından sonra, kabuktan önce, bir kez.
  if (!showcaseDone) {
    return <OnboardingShowcaseScreen onContinue={() => setShowcaseDone(true)} />;
  }

  return <AppShell paywallRequest={paywallRequest} />;
}

function AppShell({ paywallRequest }: { paywallRequest: number }): React.JSX.Element {
  const { t } = useTranslation();
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { push } = useStack();
  const [index, setIndex] = useState(INITIAL_ROUTE_INDEX);

  // Yakalama kalkanı paywall istediğinde YIĞINA itilir. Sayaç kullanılıyor
  // çünkü kullanıcı paywall'u kapatıp ikinci kez ekran görüntüsü aldığında
  // paywall'un TEKRAR açılması gerekir; boolean bunu ifade edemezdi.
  //
  // Paywall'ın tek bir açılma yolu var (yığın): ikinci bir yol, iki
  // paywall'ın üst üste açılabilmesi demekti.
  useEffect(() => {
    if (paywallRequest > 0) {
      push({ screen: 'paywall', reasonKey: 'export.capture.gateBody' });
    }
  }, [paywallRequest, push]);

  // Gösterge, kaydırma ilerlemesini JS'e uğramadan doğrudan bu shared value'dan
  // okur — her karede setState çağırmak tam olarak kaçındığımız şeydir.
  const progress = useSharedValue(INITIAL_ROUTE_INDEX);

  /**
   * Açık proje. Editör kaynağını buradan alır.
   *
   * Daha önce `<EditorScreen />` kaynaksız monte ediliyordu ve `sourceUri`
   * HİÇBİR ZAMAN dolmuyordu: her araç dokunuşu ilk satırda geri dönüyor,
   * kullanıcı hiçbir şey olmadığını görüyordu.
   */
  const [project, setProject] = useState<Project | null>(ProjectSession.current);
  useEffect(() => ProjectSession.subscribe(setProject), []);

  /** Proje açıldığında editör sekmesine geçilir. */
  const openInEditor = useCallback(() => {
    setIndex(TOP_LEVEL_ROUTES.indexOf('create'));
  }, []);

  const renderPage = useCallback((page: TopLevelRoute) => {
    switch (page) {
      case 'projects':
        return <ProjectsScreen onOpened={openInEditor} />;
      case 'create':
        return (
          <EditorScreen
            sourceUri={project ? currentVersion(project).uri : undefined}
            kind={project?.kind ?? 'photo'}
            // Çıktı GEÇMİŞE eklenir, kaynağın üzerine yazılmaz
            // (Zero-Deletion, bkz. projects/ProjectModel.ts).
            onResult={(capability, outputUri) => {
              void ProjectSession.recordResult(capability, outputUri);
            }}
          />
        );
      case 'storage':
        return <StorageScreen />;
      case 'leaderboard':
        return <LeaderboardScreen />;
      case 'feed':
        return <FeedScreen />;
      case 'settings':
        return <SettingsScreen />;
    }
  }, [openInEditor, project]);

  return (
    <View style={[styles.fill, { backgroundColor: theme.colors.background }]}>
      <View style={[styles.fill, { paddingTop: insets.top }]}>
        <GestureShell
          pages={TOP_LEVEL_ROUTES}
          index={index}
          onIndexChange={setIndex}
          renderPage={renderPage}
          progress={progress}
        />
      </View>

      <View style={{ paddingBottom: insets.bottom }}>
        <PageIndicator
          count={TOP_LEVEL_ROUTES.length}
          progress={progress}
          onSelect={setIndex}
          labels={TOP_LEVEL_ROUTES.map((route: TopLevelRoute) => t(`nav.${route}`))}
        />
      </View>

    </View>
  );
}

/**
 * Yakalama bildirimi.
 *
 * Ekranın aniden kararması, açıklama olmadan bir ARIZA gibi görünür. Bu
 * şerit ne olduğunu ve neden olduğunu söyler; suçlayıcı bir ton kullanmaz.
 */
function CaptureNotice({
  i18nKey,
  onDismiss,
}: {
  readonly i18nKey: string;
  readonly onDismiss: () => void;
}): React.JSX.Element {
  const { t } = useTranslation();
  const theme = useTheme();

  useEffect(() => {
    const timer = setTimeout(onDismiss, 6000);
    return () => clearTimeout(timer);
  }, [onDismiss]);

  return (
    <View style={[styles.notice, { backgroundColor: theme.colors.surfaceElevated }]}>
      <Text style={[typography.body, { color: theme.colors.textPrimary }]}>{t(i18nKey)}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  notice: {
    position: 'absolute',
    left: spacing.md,
    right: spacing.md,
    bottom: spacing.xxl,
    padding: spacing.md,
    borderRadius: radius.md,
  },
});
