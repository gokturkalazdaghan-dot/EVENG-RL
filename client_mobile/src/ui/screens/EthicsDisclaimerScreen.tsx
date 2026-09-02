/**
 * EthicsDisclaimerScreen — telif ve deepfake kötüye kullanımına karşı
 * yasal sorumluluk reddi.
 *
 * İKİ KATMAN
 *   1. Genel onay — ilk açılışta bir kez (üretken AI'nın doğası, telif).
 *   2. Yüz onayı  — yüz üzerinde çalışan bir araç İLK KEZ kullanıldığında.
 *      Ayrı sorulmasının sebebi: kullanıcı "AI ile filtre uyguluyorum" ile
 *      "başkasının yüzünü değiştiriyorum" arasındaki farkı, ikinciyi yaparken
 *      görmeli. Açılışta gösterilen tek bir uzun metin okunmaz.
 *
 * TASARIM KARARLARI
 *   - Reddetme GERÇEK bir seçenektir ve uygulamayı kapatmaz; yalnızca ilgili
 *     araçlar kapalı kalır. "Kabul et ya da çık" kalıbı hem etik olarak
 *     zayıftır hem de AB'de rıza geçerliliğini tartışmalı hâle getirir.
 *   - Onay cihazda tutulur, sunucuya gönderilmez (kimlik oluşturur).
 *   - Ayarlardan geri çekilebilir (EthicsConsent.revokeAll).
 */
import React from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import type { ConsentKind } from '@/ai/engine/EthicsConsent';
import { useTheme } from '@/ui/theme/ThemeProvider';
import { radius, spacing, typography } from '@/ui/theme/tokens';

export interface EthicsDisclaimerProps {
  readonly kind: ConsentKind;
  readonly visible: boolean;
  readonly onDecision: (accepted: boolean) => void;
}

export function EthicsDisclaimerScreen({
  kind,
  visible,
  onDecision,
}: EthicsDisclaimerProps): React.JSX.Element {
  const { t } = useTranslation();
  const theme = useTheme();

  const titleKey = kind === 'face' ? 'ethics.faceTitle' : 'ethics.generalTitle';
  const bodyKey = kind === 'face' ? 'ethics.faceBody' : 'ethics.generalBody';

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      // Donanım geri tuşu reddetme sayılır — kapatılamayan modal, kullanıcıyı
      // onaya zorlamaktır ve geçerli rıza üretmez.
      onRequestClose={() => onDecision(false)}
    >
      <View style={[styles.backdrop, { backgroundColor: theme.colors.scrim }]}>
        <View
          style={[
            styles.card,
            { backgroundColor: theme.colors.surface, borderColor: theme.colors.border },
          ]}
        >
          <Text style={[typography.title, { color: theme.colors.textPrimary }]}>
            {t(titleKey)}
          </Text>

          <ScrollView style={styles.bodyScroll} showsVerticalScrollIndicator={false}>
            <Text style={[typography.body, { color: theme.colors.textSecondary }]}>
              {t(bodyKey)}
            </Text>
          </ScrollView>

          <Pressable
            accessibilityRole="button"
            onPress={() => onDecision(true)}
            style={[styles.acceptButton, { backgroundColor: theme.colors.accent }]}
          >
            <Text style={[typography.body, styles.acceptLabel]}>{t('ethics.accept')}</Text>
          </Pressable>

          {/* Reddetme eşit görünürlükte: gizlenmiş bir "hayır" düğmesi,
              rızayı geçersiz kılar. */}
          <Pressable
            accessibilityRole="button"
            onPress={() => onDecision(false)}
            style={styles.declineButton}
          >
            <Text style={[typography.caption, { color: theme.colors.textSecondary }]}>
              {t('ethics.decline')}
            </Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.lg },
  card: {
    width: '100%',
    maxWidth: 460,
    maxHeight: '80%',
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    padding: spacing.xl,
    gap: spacing.md,
  },
  bodyScroll: { flexGrow: 0 },
  acceptButton: {
    height: 48,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  acceptLabel: { color: '#FFFFFF', fontWeight: '600' },
  declineButton: { height: 44, alignItems: 'center', justifyContent: 'center' },
});
