/**
 * ProjectsScreen — kaydedilmiş projeler ve YENİ PROJE girişi.
 *
 * BU EKRAN UYGULAMANIN GİRİŞ KAPISI
 * Medya seçimi buradan başlar; seçim olmadan editör kalıcı olarak boş
 * tuval gösterir. Daha önce ekran sabit bir "henüz proje yok" kartıydı ve
 * kullanıcının medya seçmesinin HİÇBİR yolu yoktu.
 *
 * İZİN SORULMAZ
 * Seçici sistem fotoğraf seçicisidir; galeriye erişim izni istemez
 * (bkz. media/MediaPicker.ts).
 */
import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { createLogger } from '@/core/logging/Logger';
import { MediaPicker } from '@/media/MediaPicker';
import { afterInteractions } from '@/performance/FrameBudget';
import { currentVersion, type Project } from '@/projects/ProjectModel';
import { ProjectSession } from '@/projects/ProjectSession';
import { ProjectStore } from '@/projects/ProjectStore';
import { Button } from '@/ui/components/Button';
import { useTheme } from '@/ui/theme/ThemeProvider';
import { radius, spacing, typography } from '@/ui/theme/tokens';

const log = createLogger('Projects');

export interface ProjectsScreenProps {
  /** Proje açıldığında editöre geçiş — çağıran taraf sekmeyi değiştirir. */
  readonly onOpened?: (project: Project) => void;
}

export function ProjectsScreen({ onOpened }: ProjectsScreenProps): React.JSX.Element {
  const { t } = useTranslation();
  const theme = useTheme();

  const [projects, setProjects] = useState<readonly Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [picking, setPicking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(() => {
    // ETKİLEŞİM BİTTİKTEN SONRA: proje listesi diskten okunuyor ve her
    // dosya için JSON ayrıştırılıyor. Bunu geçiş animasyonu sürerken
    // yapmak, kullanıcının gördüğü ilk karede takılma üretir.
    void afterInteractions(() => ProjectStore.list()).then(async (pending) => {
      setProjects(await pending);
      setLoading(false);
    });
  }, []);

  useEffect(() => {
    refresh();
    // Oturum değiştiğinde liste tazelenir: editörde bir araç çalıştığında
    // kullanıcı listeye döndüğünde güncel halini görmeli.
    return ProjectSession.subscribe(() => refresh());
  }, [refresh]);

  const startNew = useCallback(async () => {
    if (picking) return;
    setPicking(true);
    setError(null);

    const picked = await MediaPicker.pick('any');
    if (!picked.ok) {
      setPicking(false);
      // Seçici hiç yoksa (kurulum hatası) kullanıcı bunu GÖRMELİ; sessizce
      // hiçbir şey olmaması, uygulamanın bozuk olduğunu gizler.
      setError(picked.error.i18nKey ?? 'errors.UNKNOWN');
      return;
    }

    // `null` = kullanıcı vazgeçti. Hata değil, mesaj da yok.
    if (picked.value === null) {
      setPicking(false);
      return;
    }

    try {
      const project = await ProjectSession.open({
        sourceUri: picked.value.uri,
        kind: picked.value.kind,
        title: t('projects.untitled'),
      });
      onOpened?.(project);
    } catch (e) {
      log.warn('Proje açılamadı', e);
      setError('errors.CACHE_WRITE_FAILED');
    } finally {
      setPicking(false);
    }
  }, [onOpened, picking, t]);

  const openExisting = useCallback(
    async (projectId: string) => {
      const project = await ProjectSession.resume(projectId);
      if (project) onOpened?.(project);
      // Açılamayan proje listede DURUR (Zero-Deletion): dosya bozuksa bile
      // kullanıcının kaydı silinmez, yalnızca açılmaz.
      else setError('projects.openFailed');
    },
    [onOpened],
  );

  return (
    <View style={[styles.root, { backgroundColor: theme.colors.background }]}>
      <View style={styles.header}>
        <Text style={[typography.title, { color: theme.colors.textPrimary }]}>
          {t('nav.projects')}
        </Text>

        <Button
          label={t('projects.new')}
          size="small"
          block={false}
          busy={picking}
          onPress={() => void startNew()}
          accessibilityHint={t('projects.emptyHint')}
        />
      </View>

      {error !== null ? (
        <Text
          accessibilityRole="alert"
          style={[typography.caption, { color: theme.colors.danger }]}
        >
          {t(error)}
        </Text>
      ) : null}

      {loading ? (
        <ActivityIndicator color={theme.colors.accent} />
      ) : (
        <ScrollView contentContainerStyle={styles.grid} showsVerticalScrollIndicator={false}>
          {projects.length === 0 ? (
            <View style={[styles.empty, { borderColor: theme.colors.border }]}>
              <Text style={[typography.body, { color: theme.colors.textSecondary }]}>
                {t('projects.empty')}
              </Text>
              <Text style={[typography.caption, { color: theme.colors.textDisabled }]}>
                {t('projects.emptyHint')}
              </Text>
            </View>
          ) : (
            projects.map((project) => (
              <Pressable
                key={project.projectId}
                accessibilityRole="button"
                accessibilityLabel={project.title}
                onPress={() => void openExisting(project.projectId)}
                style={[styles.card, { backgroundColor: theme.colors.surfaceElevated }]}
              >
                <Text
                  numberOfLines={1}
                  style={[typography.label, { color: theme.colors.textPrimary }]}
                >
                  {project.title}
                </Text>
                <Text style={[typography.caption, { color: theme.colors.textSecondary }]}>
                  {/* Sürüm sayısı geçmişin uzunluğudur; orijinal de dahil. */}
                  {t('projects.versionCount', { count: project.versions.length })}
                </Text>
                <Text
                  numberOfLines={1}
                  style={[typography.caption, { color: theme.colors.textDisabled }]}
                >
                  {currentVersion(project).capability ?? t('projects.original')}
                </Text>
              </Pressable>
            ))
          )}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, padding: spacing.lg, gap: spacing.md },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  grid: { gap: spacing.md, paddingBottom: spacing.xxl },
  card: { padding: spacing.md, borderRadius: radius.lg, gap: spacing.xs },
  empty: {
    height: 180,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
  },
});
