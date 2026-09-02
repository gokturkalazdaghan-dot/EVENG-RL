/**
 * EditorScreen — tuval + dikey kaydırmalı katmanlar.
 *
 * Yapı:
 *   ┌─────────────────────┐
 *   │       TUVAL         │  sabit, her zaman görünür
 *   ├─────────────────────┤
 *   │  LayerSheet (dikey) │  bağlamsal araç paneli
 *   └─────────────────────┘
 *
 * Araç listesi ModelRegistry'den TÜRETİLİR (elle yazılmaz) ve her aracın
 * gerçek kullanılabilirliği OfflineCapability'den gelir: cihazda model kurulu
 * mu, RAM yetiyor mu, ağ var mı. Böylece uçaktaki kullanıcı hangi araçların
 * çalıştığını TIKLAMADAN görür.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import {
  dispatchCapability,
  DEDICATED_FLOW_CAPABILITIES,
} from '@/ai/CapabilityDispatcher';
import { MODELS, type Capability } from '@/ai/engine/ModelRegistry';
import { Entitlements } from '@/billing/Entitlements';
import { ExportFlow } from '@/export/ExportFlow';
import { MediaSaver } from '@/media/MediaSaver';
import { availabilityMap, type Availability } from '@/connectivity/OfflineCapability';
import { NetworkMonitor } from '@/connectivity/NetworkMonitor';
import { createLogger } from '@/core/logging/Logger';
import { LayerSheet } from '@/navigation/LayerSheet';
import { Button } from '@/ui/components/Button';
import { useTheme } from '@/ui/theme/ThemeProvider';
import { radius, spacing, typography } from '@/ui/theme/tokens';
import { PaywallScreen } from '@/ui/screens/PaywallScreen';
import {
  ContextualToolbar,
  type SelectionKind,
  type ToolDescriptor,
} from '@/ui/components/ContextualToolbar';

const log = createLogger('Editor');

/** Hangi aracın hangi seçim türünde anlamlı olduğu — ürün kararı. */
const APPLIES_TO: Partial<Record<Capability, readonly SelectionKind[]>> = {
  crop: ['photo', 'portrait', 'video-clip'],
  'color-filter': ['photo', 'portrait', 'video-clip'],
  trim: ['video-clip'],
  'auto-resize': ['photo', 'text'],
  'magic-eraser': ['photo', 'portrait'],
  'lens-blur': ['photo', 'portrait'],
  'generative-remove': ['photo', 'portrait'],
  'generative-expand': ['photo'],
  'face-restore': ['portrait'],
  'hd-upscale': ['photo', 'portrait'],
  'studio-background': ['portrait'],
  'ai-avatar': ['portrait'],
  'age-transform': ['portrait'],
  'concept-portrait': ['portrait'],
  'auto-captions': ['video-clip'],
  'object-tracking': ['video-clip'],
  'smart-slowmo': ['video-clip'],
  'text-to-video': ['none'],
  'smart-template': ['photo', 'text'],

  // MANUEL & BOTOX STÜDYO — ücretsiz, sınırsız, tamamen yerel.
  // Bu dördü ve Even Girl Generate adımları listede YOKTU; araç çubuğu
  // `APPLIES_TO[capability] !== undefined` ile süzdüğü için kullanıcı
  // ürünün amiral gemisi araçlarına HİÇ ULAŞAMIYORDU. Yetenekler
  // tanımlıydı, boru hattı yazılmıştı, sunucu kabul ediyordu — yalnızca
  // araç çubuğunda görünmüyorlardı.
  'manual-reshape': ['portrait'],
  'botox-jawline': ['portrait'],
  'skin-smooth': ['portrait'],
  'blemish-eraser': ['portrait'],

  // Even Girl Generate ve alt adımları.
  // `even-generate` kendi ekranını açar (bkz. DEDICATED_FLOW_CAPABILITIES);
  // araç çubuğundaki girişi o akışa yönlendirir.
  'even-generate': ['photo', 'portrait', 'none'],
  'light-sync': ['photo', 'portrait'],
  'cinematic-bokeh': ['photo', 'portrait'],
  'pore-preserve': ['portrait'],
};

export interface EditorScreenProps {
  /** Düzenlenen medyanın URI'si; yoksa boş tuval gösterilir. */
  readonly sourceUri?: string;
  /**
   * Araç çıktısı — çağıran taraf sürüm geçmişine ekler (Zero-Deletion).
   *
   * Yeteneği de veriyor: çıktının hangi araçtan geldiğini çağıran tarafta
   * ayrıca izlemek (ör. bir ref'te son aracı tutmak), iki eşzamanlı
   * çalıştırmada yanlış etiketlenmiş bir sürüm üretirdi.
   */
  readonly onResult?: (capability: Capability, outputUri: string) => void;
  /** Kendi akışı olan araçlar (Even Girl Generate) için yönlendirme. */
  readonly onOpenGenerate?: () => void;
  /** Dışa aktarılan medyanın türü — galeriye doğru koleksiyona yazmak için. */
  readonly kind?: 'photo' | 'video';
}

export function EditorScreen({
  sourceUri,
  onResult,
  onOpenGenerate,
  kind = 'photo',
}: EditorScreenProps): React.JSX.Element {
  const { t } = useTranslation();
  const theme = useTheme();

  const [layerIndex, setLayerIndex] = useState(0);
  const [selection] = useState<SelectionKind>('photo');
  const [paywallVisible, setPaywallVisible] = useState(false);
  const [availability, setAvailability] = useState<Map<Capability, Availability>>(new Map());
  const [isOffline, setIsOffline] = useState(!NetworkMonitor.isOnline);
  /** Çalışan araç — panelde ilerleme göstermek ve çift dokunuşu engellemek için. */
  const [busyTool, setBusyTool] = useState<Capability | null>(null);
  const [toolError, setToolError] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const [exportNotice, setExportNotice] = useState<string | null>(null);

  const capabilities = useMemo(() => Object.keys(MODELS) as Capability[], []);

  /**
   * Kullanılabilirlik ağ durumu değiştiğinde yeniden hesaplanır: kullanıcı
   * uçak modundan çıktığında araç çubuğu kendiliğinden canlanmalı, kullanıcı
   * ekranı yeniden açmak zorunda kalmamalı.
   */
  const refreshAvailability = useCallback(() => {
    void availabilityMap(capabilities).then(setAvailability);
  }, [capabilities]);

  useEffect(() => {
    refreshAvailability();
    return NetworkMonitor.subscribe((connection) => {
      setIsOffline(connection === 'offline');
      refreshAvailability();
    });
  }, [refreshAvailability]);

  const tools = useMemo<readonly ToolDescriptor[]>(
    () =>
      capabilities
        .filter((capability) => APPLIES_TO[capability] !== undefined)
        .map((capability) => {
          const descriptor = MODELS[capability];
          const state = availability.get(capability);

          return {
            id: capability,
            label: t(`tools.${capability}`),
            // Yerel model gerektirmeyen temel araçlar hafif; difüzyon ve
            // süper çözünürlük ağırdır ve termal kısıtlamada kapanır.
            weight: descriptor.localModel || descriptor.remoteEndpoint ? 'heavy' : 'light',
            appliesTo: APPLIES_TO[capability] ?? [],
            // Rozet, TAHMİN değil ölçülen durumdur: model gerçekten kurulu ve
            // cihaz gerçekten yetiyorsa "ÇEVRİMDIŞI" yazar.
            offlineCapable: state?.available === true && state.site === 'local',
          };
        }),
    [capabilities, availability, t],
  );

  const handleTool = useCallback(
    async (toolId: string) => {
      const capability = toolId as Capability;

      // Yetki kontrolü araç çalıştırılmadan ÖNCE: UI kilidi kullanıcı
      // deneyimi içindir, asıl kapı sunucudadır (bkz. docs/BILLING.md).
      if (!MODELS[capability].free && !Entitlements.isPro) {
        setPaywallVisible(true);
        return;
      }
      // Çalışan bir araç varken ikinci dokunuş yok sayılır: iki ağır
      // modelin aynı anda çalışması cihazı ısıtır ve ikisi de yavaşlar.
      if (busyTool !== null) return;

      // KENDİ AKIŞI OLAN ARAÇLAR buradan çalıştırılmaz.
      // Even Girl Generate kavram + referans foto + arka plan ister; boş
      // parametreyle çağırmak kullanıcıya anlamsız bir doğrulama hatası
      // gösterirdi.
      if (DEDICATED_FLOW_CAPABILITIES.has(capability)) {
        onOpenGenerate?.();
        return;
      }

      setBusyTool(capability);
      setToolError(null);

      // BORU HATTI ÜZERİNDEN: doğrudan `AiEngine.run(capability, {
      // maxEdgePx: 2048 })` çağrılıyordu ve yetenek başına ayarlanan kenar
      // tavanları hiç uygulanmıyordu (ör. ai-avatar 1024 yerine 2048'de
      // yerel çalışıyor, bellek tepe noktası cihazı zorluyordu).
      const result = await dispatchCapability(capability, sourceUri);
      setBusyTool(null);

      if (!result.ok) {
        if (result.error.code === 'ENTITLEMENT_REQUIRED') {
          setPaywallVisible(true);
          return;
        }
        // HATA KULLANICIYA GÖSTERİLİR. Yalnızca log'a yazmak, kullanıcının
        // düğmeye basıp hiçbir şey olmadığını görmesi demekti.
        log.warn(`${capability} çalıştırılamadı: ${result.error.code}`);
        setToolError(result.error.i18nKey ?? `errors.${result.error.code}`);
        return;
      }

      log.debug(`${capability} tamamlandı (${result.value.executedOn})`);
      onResult?.(capability, result.value.outputUri);
    },
    [busyTool, onOpenGenerate, onResult, sourceUri],
  );

  /**
   * Dışa aktarım.
   *
   * KOTA KAPISI SUNUCUDA (ExportFlow.check). Kayıt DENENMEZ ve hak yoksa
   * paywall açılır: hak yokken galeriye yazıp sonra silmek, kullanıcının
   * galerisinde bir an için dosya oluşturur.
   *
   * Kaydedilen ÇIKTIDIR, kaynak değil: `sourceUri` her zaman geçerli
   * sürümün URI'si (bkz. App.tsx), yani kullanıcı ekranda ne görüyorsa o.
   */
  const exportToGallery = useCallback(async () => {
    if (!sourceUri || exporting) return;

    setExporting(true);
    setExportNotice(null);

    const outcome = await ExportFlow.save(sourceUri, async (path) => {
      const saved = await MediaSaver.save(path, kind);
      // Hata FIRLATILIR ki ExportFlow sayacı İLERLETMESİN: başarısız bir
      // kayıt kullanıcının ücretsiz hakkını yakmamalı.
      if (!saved.ok) throw new Error(saved.error.i18nKey ?? saved.error.code);
    });

    setExporting(false);

    switch (outcome.kind) {
      case 'saved':
        setExportNotice('export.saved');
        return;
      case 'paywall':
        setPaywallVisible(true);
        return;
      case 'failed':
        setExportNotice('export.failed');
    }
  }, [exporting, kind, sourceUri]);

  return (
    <View style={[styles.root, { backgroundColor: theme.colors.background }]}>
      <View style={styles.canvas}>
        <Text style={[typography.caption, { color: theme.colors.textDisabled }]}>
          {sourceUri ? '' : t('editor.emptyCanvas')}
        </Text>

        {busyTool !== null ? (
          <Text style={[typography.caption, { color: theme.colors.textSecondary }]}>
            {t('editor.running', { tool: t(`tools.${busyTool}`) })}
          </Text>
        ) : null}

        {toolError !== null ? (
          <Text
            accessibilityRole="alert"
            style={[typography.caption, { color: theme.colors.danger }]}
          >
            {t(toolError)}
          </Text>
        ) : null}

        {exportNotice !== null ? (
          <Text
            accessibilityRole="alert"
            style={[
              typography.caption,
              {
                color:
                  exportNotice === 'export.saved'
                    ? theme.colors.textSecondary
                    : theme.colors.danger,
              },
            ]}
          >
            {t(exportNotice)}
          </Text>
        ) : null}
      </View>

      {/*
        DIŞA AKTARIM DÜĞMESİ yalnızca kaynak varken görünür: boş tuvalde
        kaydedilecek bir şey yok ve devre dışı bir düğme göstermek, ne
        yapması gerektiğini söylemeyen bir arayüzdür.
      */}
      {sourceUri ? (
        <Button
          label={t('export.save')}
          busy={exporting}
          busyLabel={t('export.saving')}
          onPress={() => void exportToGallery()}
          style={styles.exportButton}
        />
      ) : null}

      <LayerSheet snapIndex={layerIndex} onSnapIndexChange={setLayerIndex}>
        <ContextualToolbar
          tools={tools}
          selection={selection}
          isOffline={isOffline}
          onSelectTool={(id) => void handleTool(id)}
        />
      </LayerSheet>

      <Modal
        visible={paywallVisible}
        animationType="slide"
        // Donanım geri tuşu ve kaydırarak kapatma çalışmalı: kapatılamayan
        // paywall her iki mağazada da ret sebebidir.
        onRequestClose={() => setPaywallVisible(false)}
        presentationStyle="pageSheet"
      >
        <PaywallScreen
          reasonKey="paywall.requiredForFeature"
          onDismiss={() => setPaywallVisible(false)}
          onPurchased={() => setPaywallVisible(false)}
        />
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  canvas: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.lg },
  exportButton: { marginHorizontal: spacing.lg, marginBottom: spacing.sm },
});
