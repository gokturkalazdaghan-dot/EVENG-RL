/**
 * ContextualToolbar — bağlama göre değişen araç çubuğu.
 *
 * TASARIM KARARI: Karmaşık menü ağacı yerine, seçili nesneye göre yalnızca
 * ANLAMLI araçlar gösterilir. Bir video klip seçiliyken "yüz onarımı", bir
 * portre seçiliyken "zaman çizelgesi kesme" gösterilmez. Bu, kategorinin en
 * büyük kullanılabilirlik sorununu (araç kalabalığı) doğrudan hedefler.
 *
 * Güç profiliyle bağlantı: cihaz 'critical' profildeyken ağır araçlar pasif
 * görünür ve nedeni söylenir. Kullanıcıyı önce tıklatıp sonra hata göstermek,
 * bu kategoride en sinir bozucu kalıptır.
 */
import React, { useMemo } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { ThermalGovernor } from '@/performance/ThermalGovernor';
import { useTheme } from '@/ui/theme/ThemeProvider';
import { radius, spacing, typography } from '@/ui/theme/tokens';

export type ToolWeight = 'light' | 'heavy';

export interface ToolDescriptor {
  readonly id: string;
  readonly label: string;
  /** Ağır araçlar termal kısıtlamada pasifleşir. */
  readonly weight: ToolWeight;
  /** Bu araç hangi seçim türlerinde anlamlı. */
  readonly appliesTo: readonly SelectionKind[];
  /** Çevrimdışı çalışabilir mi (Modül 4'te model kaydından beslenecek). */
  readonly offlineCapable: boolean;
}

export type SelectionKind = 'video-clip' | 'photo' | 'portrait' | 'text' | 'none';

export interface ContextualToolbarProps {
  readonly tools: readonly ToolDescriptor[];
  readonly selection: SelectionKind;
  readonly isOffline: boolean;
  readonly onSelectTool: (toolId: string) => void;
}

export function ContextualToolbar({
  tools,
  selection,
  isOffline,
  onSelectTool,
}: ContextualToolbarProps): React.JSX.Element {
  const { t } = useTranslation();
  const theme = useTheme();
  const profile = ThermalGovernor.profileId;

  const visibleTools = useMemo(
    () => tools.filter((tool) => tool.appliesTo.includes(selection)),
    [tools, selection],
  );

  if (visibleTools.length === 0) {
    return (
      <View style={styles.empty}>
        <Text style={[typography.caption, { color: theme.colors.textSecondary }]}>
          {t('editor.selectItem')}
        </Text>
      </View>
    );
  }

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.row}
      // Araç çubuğu yatay kaydırılır ama bu, sayfa geçişini TETİKLEMEMELİDİR.
      // GestureShell'in failOffsetY/activeOffsetX eşikleri bu ayrımı sağlar.
      keyboardShouldPersistTaps="handled"
    >
      {visibleTools.map((tool) => {
        const blockedByThermal = tool.weight === 'heavy' && profile === 'critical';
        const blockedByNetwork = isOffline && !tool.offlineCapable;
        const disabled = blockedByThermal || blockedByNetwork;

        return (
          <Pressable
            key={tool.id}
            accessibilityRole="button"
            accessibilityState={{ disabled }}
            accessibilityHint={
              blockedByThermal
                ? t('editor.hint.thermalDisabled')
                : blockedByNetwork
                  ? t('editor.hint.networkRequired')
                  : undefined
            }
            disabled={disabled}
            onPress={() => onSelectTool(tool.id)}
            style={({ pressed }) => [
              styles.tool,
              {
                backgroundColor: theme.colors.surfaceElevated,
                borderColor: theme.colors.border,
                opacity: disabled ? 0.4 : pressed ? 0.7 : 1,
              },
            ]}
          >
            <Text
              style={[
                typography.caption,
                { color: disabled ? theme.colors.textDisabled : theme.colors.textPrimary },
              ]}
            >
              {tool.label}
            </Text>

            {/* Neden pasif olduğu ARAÇ ÜZERİNDE yazar; kullanıcı tıklayıp
                hata almak zorunda kalmaz. */}
            {blockedByNetwork ? (
              <Text style={[typography.label, { color: theme.colors.textSecondary }]}>
                {t('editor.badge.online')}
              </Text>
            ) : blockedByThermal ? (
              <Text style={[typography.label, { color: theme.colors.danger }]}>
                {t('editor.badge.cooling')}
              </Text>
            ) : tool.offlineCapable ? (
              <Text style={[typography.label, { color: theme.colors.success }]}>
                {t('editor.badge.offline')}
              </Text>
            ) : null}
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  row: { gap: spacing.sm, paddingVertical: spacing.sm, paddingHorizontal: spacing.xs },
  tool: {
    minWidth: 88,
    height: 64,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingHorizontal: spacing.sm,
  },
  empty: { height: 80, alignItems: 'center', justifyContent: 'center' },
});
