/**
 * MarketScreen — şablon pazarı listesi.
 *
 * Şablon önizlemeleri de görünürlük kalkanından geçer (`TemplateMarket.browse`
 * bunu yapar): pazar yeri, moderasyonun atlandığı bir arka kapı olamaz.
 */
import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { TemplateMarket, type Template } from '@/social/TemplateMarket';
import { useStack } from '@/navigation/Stack';
import { useTheme } from '@/ui/theme/ThemeProvider';
import { radius, spacing, typography } from '@/ui/theme/tokens';

export function MarketScreen(): React.JSX.Element {
  const { t } = useTranslation();
  const theme = useTheme();
  const { push } = useStack();

  const [templates, setTemplates] = useState<readonly Template[]>([]);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);

  const load = useCallback(async () => {
    setFailed(false);
    const result = await TemplateMarket.browse({ adultContentOptIn: false });
    if (!result.ok) {
      setFailed(true);
      return;
    }
    setTemplates(result.value.templates);
  }, []);

  useEffect(() => {
    void load().finally(() => setLoading(false));
  }, [load]);

  if (loading) {
    return (
      <View style={[styles.center, { backgroundColor: theme.colors.background }]}>
        <ActivityIndicator color={theme.colors.accent} />
      </View>
    );
  }

  return (
    <View style={[styles.root, { backgroundColor: theme.colors.background }]}>
      <Text style={[typography.title, styles.header, { color: theme.colors.textPrimary }]}>
        {t('market.title')}
      </Text>

      <FlatList
        data={templates as Template[]}
        numColumns={2}
        keyExtractor={(item) => item.templateId}
        contentContainerStyle={styles.list}
        ListEmptyComponent={
          <View style={styles.center}>
            <Text style={[typography.body, { color: theme.colors.textSecondary }]}>
              {failed ? t('market.loadFailed') : t('profile.empty')}
            </Text>
            {failed ? (
              <Pressable accessibilityRole="button" onPress={() => void load()}>
                <Text style={[typography.body, { color: theme.colors.accent }]}>
                  {t('common.retry')}
                </Text>
              </Pressable>
            ) : null}
          </View>
        }
        renderItem={({ item }) => (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={item.title}
            style={styles.card}
            onPress={() => push({ screen: 'template', templateId: item.templateId })}
          >
            <Image source={{ uri: item.previewUri }} style={styles.preview} />
            <Text
              style={[typography.caption, { color: theme.colors.textPrimary }]}
              numberOfLines={1}
            >
              {item.title}
            </Text>
            {item.proOnly ? (
              <Text style={[typography.label, { color: theme.colors.accent }]}>
                {t('market.proOnly')}
              </Text>
            ) : null}
          </Pressable>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: { padding: spacing.lg },
  list: { padding: spacing.sm, gap: spacing.sm },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.sm, padding: spacing.xl },
  card: { flex: 1 / 2, margin: spacing.xs, gap: spacing.xs },
  preview: { width: '100%', aspectRatio: 3 / 4, borderRadius: radius.md },
});
