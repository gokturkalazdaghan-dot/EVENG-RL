/**
 * StorageScreen — depolama kullanımı ve manuel temizlik.
 *
 * NEDEN AYRI BİR EKRAN: Kullanıcı "bu uygulama 8 GB yer kaplıyor" gördüğünde
 * yaptığı şey uygulamayı silmektir. Kullanımı görünür kılmak ve tek dokunuşla
 * temizlik sunmak, bu kategoride ölçülebilir bir churn azaltıcıdır.
 *
 * Modeller varsayılan olarak KORUNUR: silmek çevrimdışı yeteneği sessizce
 * kaldırır. Ayrı ve açık bir seçim olarak sunulur.
 */
import React, { useCallback, useEffect, useState } from 'react';
import {ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { CacheManager, type CacheUsage } from '@/storage/CacheManager';
import { CloudDraftSync, type CloudProvider } from '@/storage/CloudDraftSync';
import { ProjectSession } from '@/projects/ProjectSession';
import { currentVersion } from '@/projects/ProjectModel';
import { Button } from '@/ui/components/Button';
import { useTheme } from '@/ui/theme/ThemeProvider';
import { radius, spacing, typography } from '@/ui/theme/tokens';

const formatMb = (bytes: number): string => `${(bytes / 1024 / 1024).toFixed(0)} MB`;

export function StorageScreen(): React.JSX.Element {
  const { t } = useTranslation();
  const theme = useTheme();
  const [usage, setUsage] = useState<CacheUsage | null>(null);
  const [busy, setBusy] = useState(false);
  /**
   * Bulut sağlayıcısı — KULLANICININ kendi bulutu, bizim sunucumuz değil.
   * Projeleri kendi altyapımızda tutmak 'sıfır veri toplama' ilkesini
   * kökten bozardı (bkz. storage/CloudDraftSync.ts).
   */
  const [provider, setProvider] = useState<CloudProvider>('none');
  const [cloudNotice, setCloudNotice] = useState<string | null>(null);
  const [backingUp, setBackingUp] = useState(false);

  const refresh = useCallback(async () => {
    setUsage(await CacheManager.usage());
  }, []);

  useEffect(() => {
    void refresh();
    void CloudDraftSync.provider().then(setProvider);
  }, [refresh]);

  /**
   * Açık projeyi kullanıcının bulutuna yedekler.
   *
   * ÖLÇÜLÜ BAĞLANTIDA ONAY İSTENİR: 2 GB'lık bir video projesini
   * farkında olmadan hücresel veriyle yüklemek, faturaya yansıyan
   * gerçek bir zarardır. Burada `allowMetered` GEÇİLMİYOR; kullanıcı
   * uyarıyı görüp yeniden dener.
   */
  const backup = useCallback(async () => {
    const project = ProjectSession.current;
    if (!project || backingUp) return;

    setBackingUp(true);
    setCloudNotice(null);

    const result = await CloudDraftSync.backup(
      project.projectId,
      currentVersion(project).uri,
      project.title,
    );
    setBackingUp(false);
    setCloudNotice(
      result.ok ? 'cloud.backedUp' : (result.error.i18nKey ?? 'cloud.backupFailed'),
    );
  }, [backingUp]);

  const clear = useCallback(
    async (includeModels: boolean) => {
      setBusy(true);
      try {
        await CacheManager.clearUserInitiated({ includeModels });
        await refresh();
      } finally {
        setBusy(false);
      }
    },
    [refresh],
  );

  if (!usage) {
    return (
      <View style={[styles.root, styles.center, { backgroundColor: theme.colors.background }]}>
        <ActivityIndicator color={theme.colors.accent} />
      </View>
    );
  }

  const ratio = Math.min(1, usage.totalBytes / usage.limitBytes);

  return (
    <View style={[styles.root, { backgroundColor: theme.colors.background }]}>
      <Text style={[typography.title, { color: theme.colors.textPrimary }]}>
        {t('storage.title')}
      </Text>

      <View style={[styles.card, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}>
        <Text style={[typography.display, { color: theme.colors.textPrimary }]}>
          {formatMb(usage.totalBytes)}
        </Text>
        <Text style={[typography.caption, { color: theme.colors.textSecondary }]}>
          {t('storage.usedOfLimit', {
            limit: formatMb(usage.limitBytes),
            percent: Math.round(ratio * 100),
          })}
        </Text>

        <View style={[styles.barTrack, { backgroundColor: theme.colors.border }]}>
          <View
            style={[
              styles.barFill,
              {
                width: `${ratio * 100}%`,
                backgroundColor: ratio > 0.9 ? theme.colors.danger : theme.colors.accent,
              },
            ]}
          />
        </View>

        <View style={styles.breakdown}>
          <Row label={t('storage.renderCache')} value={formatMb(usage.byBucket.renderCache)} />
          <Row label={t('storage.thumbnails')} value={formatMb(usage.byBucket.thumbnails)} />
          <Row label={t('storage.models')} value={formatMb(usage.byBucket.models)} />
        </View>
      </View>

      {/*
        BULUT YEDEĞİ yalnızca sağlayıcı bağlıyken görünür. Bağlı değilken
        düğme göstermek, dokununca "kullanılamıyor" diyen bir arayüzdür.
      */}
      {provider !== 'none' ? (
        <Button
          label={t('cloud.backup')}
          busyLabel={t('cloud.backingUp')}
          busy={backingUp}
          disabled={ProjectSession.current === null}
          variant="secondary"
          size="medium"
          onPress={() => void backup()}
        />
      ) : null}

      {cloudNotice !== null ? (
        <Text
          accessibilityRole="alert"
          style={[
            typography.caption,
            {
              color:
                cloudNotice === 'cloud.backedUp'
                  ? theme.colors.textSecondary
                  : theme.colors.danger,
            },
          ]}
        >
          {t(cloudNotice)}
        </Text>
      ) : null}

      <Button
        label={t('storage.clearTemporary')}
        busy={busy}
        onPress={() => void clear(false)}
      />

      <Button
        label={t('storage.clearModels')}
        variant="secondary"
        size="medium"
        disabled={busy}
        accessibilityHint={t('storage.clearModelsHint')}
        onPress={() => void clear(true)}
      />
    </View>
  );
}

function Row({ label, value }: { label: string; value: string }): React.JSX.Element {
  const theme = useTheme();
  return (
    <View style={styles.row}>
      <Text style={[typography.caption, { color: theme.colors.textSecondary }]}>{label}</Text>
      <Text style={[typography.caption, { color: theme.colors.textPrimary }]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, padding: spacing.lg, gap: spacing.md },
  center: { alignItems: 'center', justifyContent: 'center' },
  card: {
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    padding: spacing.lg,
    gap: spacing.xs,
  },
  barTrack: { height: 6, borderRadius: radius.pill, marginTop: spacing.md, overflow: 'hidden' },
  barFill: { height: 6, borderRadius: radius.pill },
  breakdown: { marginTop: spacing.md, gap: spacing.xs },
  row: { flexDirection: 'row', justifyContent: 'space-between' },
  button: {
    height: 48,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonLabel: { color: '#FFFFFF', fontWeight: '600' },
  buttonSecondary: {
    height: 44,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
