/**
 * ReportAffordance — atlatılamaz rapor düğmesi.
 *
 * TEK GİRİŞ NOKTASI: Her UGC yüzeyi rapor akışına BU bileşenle girer.
 * Ekranların kendi rapor düğmesini çizmesine izin verilirse, biri onu bir
 * "..." menüsünün ikinci seviyesine koyar ve Guideline 1.2 incelemesinde
 * "mekanizma bulunamadı" sonucu doğar.
 *
 * GÖRÜNÜRLÜK KOŞULSUZDUR
 * `visible` diye bir prop YOK. Bileşen render edildiği anda görünür. Kendi
 * içeriğinde düğme devre dışıdır ama kaybolmaz — kullanıcı aracın var
 * olduğunu her ekranda öğrenir.
 *
 * DOKUNMA HEDEFİ 44×44
 * Küçük bir ikon, taciz altındaki kullanıcının ıskaladığı bir düğmedir.
 */
import React, { useCallback, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { Moderation } from '@/moderation/Reporting';
import {
  reportAffordanceEnabled,
  reportDisabledReasonKey,
  type ReportSurface,
} from '@/moderation/ReportSurfaces';
import { ReportBlockSheet } from '@/ui/components/ReportBlockSheet';
import { useTheme } from '@/ui/theme/ThemeProvider';
import { radius, spacing, typography } from '@/ui/theme/tokens';

export interface ReportAffordanceProps {
  readonly surface: ReportSurface;
  readonly contentId: string;
  readonly authorId: string;
  readonly viewerId: string;
  /** Karanlık medya üzerinde okunabilirlik için. */
  readonly tone?: 'default' | 'overlay';
}

export function ReportAffordance({
  surface,
  contentId,
  authorId,
  viewerId,
  tone = 'default',
}: ReportAffordanceProps): React.JSX.Element {
  const { t } = useTranslation();
  const theme = useTheme();
  const [sheetOpen, setSheetOpen] = useState(false);

  const alreadyReported = Moderation.hasReported(contentId);
  const enabled = reportAffordanceEnabled({ viewerId, authorId, alreadyReported });
  const disabledKey = reportDisabledReasonKey({ viewerId, authorId, alreadyReported });

  const open = useCallback(() => {
    if (enabled) setSheetOpen(true);
  }, [enabled]);

  const overlay = tone === 'overlay';

  return (
    <View style={styles.wrap}>
      <Pressable
        onPress={open}
        disabled={!enabled}
        accessibilityRole="button"
        accessibilityState={{ disabled: !enabled }}
        accessibilityLabel={t('moderation.action.report')}
        accessibilityHint={disabledKey ? t(disabledKey) : t('moderation.action.reportHint')}
        // Test kancası: kayıt defteri denetimi bu kimliği arar.
        testID={`report-affordance-${surface}`}
        hitSlop={12}
        style={({ pressed }) => [
          styles.button,
          {
            backgroundColor: overlay ? 'rgba(0,0,0,0.45)' : theme.colors.surfaceElevated,
            opacity: enabled ? (pressed ? 0.7 : 1) : 0.45,
          },
        ]}
      >
        <Text
          style={[
            styles.label,
            { color: overlay ? '#FFFFFF' : theme.colors.textSecondary },
          ]}
          numberOfLines={1}
        >
          {t('moderation.action.report')}
        </Text>
      </Pressable>

      <ReportBlockSheet
        visible={sheetOpen}
        contentId={contentId}
        authorId={authorId}
        onClose={() => setSheetOpen(false)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignSelf: 'flex-start' },
  button: {
    minHeight: 44,
    minWidth: 44,
    justifyContent: 'center',
    paddingHorizontal: spacing.md,
    borderRadius: radius.pill,
  },
  label: { ...typography.label },
});
