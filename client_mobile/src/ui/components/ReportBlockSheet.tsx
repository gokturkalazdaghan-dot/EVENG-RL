/**
 * ReportBlockSheet — içerik raporlama ve kullanıcı engelleme.
 *
 * ERİŞİLEBİLİRLİK KURALI: Bu sayfaya ulaşmak İKİ dokunuştan uzak olmamalı.
 * Rapor mekanizmasını menü içine gömmek, Apple Guideline 1.2 incelemesinde
 * "mekanizma yok" sayılmasının en yaygın sebebidir; ayrıca taciz edilen
 * kullanıcı, aracı bulamadığında uygulamayı bırakır.
 *
 * ENGELLE, RAPORDAN AYRI: Kullanıcı çoğu zaman moderasyon istemez, sadece o
 * kişiyi görmek istemez. Engellemeyi rapor akışının içine gömmek, insanları
 * gereksiz yere rapor yazmaya zorlar ve kuyruğu kirletir.
 */
import React, { useCallback, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { Moderation, suspendsImmediately, type ReportReason } from '@/moderation/Reporting';
import { useTheme } from '@/ui/theme/ThemeProvider';
import { radius, spacing, typography } from '@/ui/theme/tokens';

const REASONS: readonly ReportReason[] = [
  'minor-safety',
  'nonconsensual-intimate',
  'sexual-content-unlabeled',
  'harassment',
  'hate-speech',
  'violence',
  'impersonation',
  'copyright',
  'spam',
  'other',
];

export interface ReportBlockSheetProps {
  readonly visible: boolean;
  readonly contentId: string;
  readonly authorId: string;
  readonly onClose: () => void;
}

type Phase = 'menu' | 'reasons' | 'sent' | 'failed';

export function ReportBlockSheet({
  visible,
  contentId,
  authorId,
  onClose,
}: ReportBlockSheetProps): React.JSX.Element {
  const { t } = useTranslation();
  const theme = useTheme();

  const [phase, setPhase] = useState<Phase>('menu');
  const [busy, setBusy] = useState(false);
  const [suspended, setSuspended] = useState(false);

  const close = useCallback(() => {
    setPhase('menu');
    onClose();
  }, [onClose]);

  const block = useCallback(async () => {
    setBusy(true);
    try {
      // Engel YEREL olarak derhal uygulanır; sunucu senkronu arka planda.
      await Moderation.block(authorId);
      close();
    } finally {
      setBusy(false);
    }
  }, [authorId, close]);

  const submitReport = useCallback(
    async (reason: ReportReason) => {
      setBusy(true);
      try {
        const result = await Moderation.report({ contentId, authorId, reason });
        if (!result.ok) {
          // Rapor sunucuya ULAŞMALIDIR; yerel bir işaret moderasyon yapmaz.
          // Bu yüzden hata sessizce yutulmuyor.
          setPhase('failed');
          return;
        }
        setSuspended(result.value.suspended || suspendsImmediately(reason));
        setPhase('sent');
      } finally {
        setBusy(false);
      }
    },
    [contentId, authorId],
  );

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={close}>
      <View style={[styles.backdrop, { backgroundColor: theme.colors.scrim }]}>
        <View
          style={[
            styles.sheet,
            { backgroundColor: theme.colors.surface, borderColor: theme.colors.border },
          ]}
        >
          {phase === 'menu' ? (
            <>
              <Text style={[typography.heading, { color: theme.colors.textPrimary }]}>
                {t('moderation.title')}
              </Text>

              <Action
                label={t('moderation.action.report')}
                hint={t('moderation.action.reportHint')}
                onPress={() => setPhase('reasons')}
              />
              <Action
                label={t('moderation.action.block')}
                hint={t('moderation.action.blockHint')}
                danger
                disabled={busy}
                onPress={() => void block()}
              />
            </>
          ) : null}

          {phase === 'reasons' ? (
            <>
              <Text style={[typography.heading, { color: theme.colors.textPrimary }]}>
                {t('moderation.reasonTitle')}
              </Text>
              <ScrollView style={styles.reasonList}>
                {REASONS.map((reason) => (
                  <Action
                    key={reason}
                    label={t(`moderation.reason.${reason}`)}
                    disabled={busy}
                    onPress={() => void submitReport(reason)}
                  />
                ))}
              </ScrollView>
            </>
          ) : null}

          {phase === 'sent' ? (
            <>
              <Text style={[typography.heading, { color: theme.colors.textPrimary }]}>
                {t('moderation.sentTitle')}
              </Text>
              <Text style={[typography.body, { color: theme.colors.textSecondary }]}>
                {suspended ? t('moderation.sentSuspended') : t('moderation.sentBody')}
              </Text>
            </>
          ) : null}

          {phase === 'failed' ? (
            <>
              <Text style={[typography.heading, { color: theme.colors.danger }]}>
                {t('moderation.report.failed')}
              </Text>
              <Action label={t('common.retry')} onPress={() => setPhase('reasons')} />
            </>
          ) : null}

          <Pressable accessibilityRole="button" onPress={close} style={styles.closeRow}>
            <Text style={[typography.body, { color: theme.colors.textSecondary }]}>
              {t('common.close')}
            </Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

function Action({
  label,
  hint,
  onPress,
  danger = false,
  disabled = false,
}: {
  label: string;
  hint?: string;
  onPress: () => void;
  danger?: boolean;
  disabled?: boolean;
}): React.JSX.Element {
  const theme = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [styles.action, { opacity: disabled ? 0.5 : pressed ? 0.7 : 1 }]}
    >
      <Text style={[typography.body, { color: danger ? theme.colors.danger : theme.colors.textPrimary }]}>
        {label}
      </Text>
      {hint ? (
        <Text style={[typography.caption, { color: theme.colors.textSecondary }]}>{hint}</Text>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, justifyContent: 'flex-end' },
  sheet: {
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    borderTopWidth: StyleSheet.hairlineWidth,
    padding: spacing.lg,
    gap: spacing.sm,
    maxHeight: '80%',
  },
  reasonList: { maxHeight: 320 },
  action: { paddingVertical: spacing.md, gap: 2 },
  closeRow: { alignItems: 'center', paddingVertical: spacing.md },
});
