/**
 * LeaderboardScreen — haftalık Even sıralaması.
 *
 * Sıralama ve rozet kararları `social/LeaderboardPolicy.ts` içindedir; bu
 * ekran yalnızca gösterir. Reşit olmayan hesaplar herkese açık listede
 * görünmez ama kendi rozetlerini ve kendi puanlarını görürler.
 */
import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { RewardRedemption, type PendingReward } from '@/billing/RewardRedemption';
import { pinnedRequest } from '@/security/SslPinning';
import { AgeGate } from '@/age/AgeGate';
import {
  rank,
  selfBadge,
  weekEndMs,
  type LeaderboardEntry,
  type RankedEntry,
} from '@/social/LeaderboardPolicy';
import { GarlandBadge } from '@/ui/components/GarlandBadge';
import { useTheme } from '@/ui/theme/ThemeProvider';
import { radius, spacing, typography } from '@/ui/theme/tokens';

interface LeaderboardResponse {
  readonly entries: LeaderboardEntry[];
  readonly me: LeaderboardEntry | null;
  readonly myPublicRank: number | null;
}

export function LeaderboardScreen(): React.JSX.Element {
  const { t } = useTranslation();
  const theme = useTheme();

  const [ranked, setRanked] = useState<readonly RankedEntry[]>([]);
  const [me, setMe] = useState<LeaderboardEntry | null>(null);
  const [myRank, setMyRank] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  /**
   * Bekleyen ödüller.
   *
   * SIRALAMA EKRANINDA gösteriliyor çünkü ödül buradan kazanılıyor.
   * Ödülün yalnızca push bildirimine bağlı olması, bildirim izni
   * vermemiş ya da o an cihazı kapalı olan kazananları ödülsüz
   * bırakırdı — bu yüzden her açılışta ayrıca SORULUYOR.
   */
  const [rewards, setRewards] = useState<readonly PendingReward[]>([]);
  const [redeemError, setRedeemError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const result = await pinnedRequest<LeaderboardResponse>({ path: '/v1/leaderboard/weekly' });
    if (!result.ok) return;

    // Sıralamayı sunucudan geldiği gibi göstermek yerine yeniden
    // hesaplıyoruz: uygunluk kuralı (reşit olmayanların listede olmaması)
    // istemcide de uygulanmalı, sunucuya güvenip atlamamalı.
    setRanked(rank(result.value.entries));
    setMe(result.value.me);
    setMyRank(result.value.myPublicRank);
  }, []);

  const loadRewards = useCallback(() => {
    void RewardRedemption.pending().then(setRewards);
  }, []);

  useEffect(() => {
    void load().finally(() => setLoading(false));
    loadRewards();
  }, [load, loadRewards]);

  const redeem = useCallback(
    async (reward: PendingReward) => {
      setRedeemError(null);
      const result = await RewardRedemption.redeem(reward);
      if (!result.ok) {
        // Kullanım sayfası açılamadıysa ödül DURUYOR: listeden
        // düşürmek, kullanıcının kazandığı hakkı görünmez yapardı.
        setRedeemError(result.error.i18nKey ?? 'reward.redeemFailed');
        return;
      }
      // Bildirim sunucuya gider; sunucu mağaza kaydıyla DOĞRULAR.
      // İstemcinin 'kullandım' demesi tek başına yeterli değil.
      await RewardRedemption.acknowledge(reward.week);
      loadRewards();
    },
    [loadRewards],
  );

  if (loading) {
    return (
      <View style={[styles.center, { backgroundColor: theme.colors.background }]}>
        <ActivityIndicator color={theme.colors.accent} />
      </View>
    );
  }

  const resetsInHours = Math.max(
    0,
    Math.round((weekEndMs(Date.now()) - Date.now()) / (60 * 60 * 1000)),
  );

  return (
    <View style={[styles.root, { backgroundColor: theme.colors.background }]}>
      <View style={styles.header}>
        <Text style={[typography.title, { color: theme.colors.textPrimary }]}>
          {t('leaderboard.title')}
        </Text>
        <Text style={[typography.caption, { color: theme.colors.textSecondary }]}>
          {t('leaderboard.resetsIn', { hours: resetsInHours })}
        </Text>
      </View>

      {rewards.map((reward) => (
        <Pressable
          key={reward.week}
          accessibilityRole="button"
          accessibilityLabel={t('reward.redeem')}
          onPress={() => void redeem(reward)}
          style={[styles.rewardCard, { backgroundColor: theme.colors.accent }]}
        >
          <Text style={[typography.label, styles.rewardText]}>
            {t('reward.available', { rank: reward.rank, days: reward.days })}
          </Text>
          <Text style={[typography.caption, styles.rewardText]}>{t('reward.redeem')}</Text>
        </Pressable>
      ))}

      {redeemError !== null ? (
        <Text
          accessibilityRole="alert"
          style={[typography.caption, { color: theme.colors.danger }]}
        >
          {t(redeemError)}
        </Text>
      ) : null}

      {/* Kendi kartı — herkese açık listede görünmese bile kullanıcı kendi
          puanını ve rozetini görür. */}
      {me ? (
        <View
          style={[
            styles.selfCard,
            { backgroundColor: theme.colors.surface, borderColor: theme.colors.accent },
          ]}
        >
          <GarlandBadge badge={selfBadge(me, myRank)} style={me.garlandStyle} size={44} />
          <View style={styles.selfText}>
            <Text style={[typography.heading, { color: theme.colors.textPrimary }]}>
              {t('leaderboard.you')}
            </Text>
            <Text style={[typography.caption, { color: theme.colors.textSecondary }]}>
              {myRank
                ? t('leaderboard.yourRank', { rank: myRank, score: me.weeklyScore })
                : t('leaderboard.notListed', { score: me.weeklyScore })}
            </Text>
          </View>
        </View>
      ) : null}

      <FlatList
        data={ranked as RankedEntry[]}
        keyExtractor={(entry) => entry.userId}
        ListEmptyComponent={
          <Text style={[typography.body, styles.empty, { color: theme.colors.textSecondary }]}>
            {t('leaderboard.empty')}
          </Text>
        }
        renderItem={({ item }) => (
          <View style={[styles.row, { borderColor: theme.colors.border }]}>
            <Text style={[typography.heading, styles.rank, { color: theme.colors.textSecondary }]}>
              {item.rank}
            </Text>
            <GarlandBadge badge={item.badge} style={item.garlandStyle} size={40} />
            <Text style={[typography.body, styles.handle, { color: theme.colors.textPrimary }]}>
              {item.userId}
            </Text>
            <Text style={[typography.caption, { color: theme.colors.textSecondary }]}>
              {item.weeklyScore}
            </Text>
          </View>
        )}
      />

      {!AgeGate.isAdult ? (
        <Text style={[typography.caption, styles.notice, { color: theme.colors.textDisabled }]}>
          {t('leaderboard.safeModeNotice')}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  rewardCard: { padding: spacing.md, borderRadius: radius.lg, gap: spacing.xs },
  rewardText: { color: '#FFFFFF' },
  root: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  header: { padding: spacing.lg, gap: spacing.xs },
  selfCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    marginHorizontal: spacing.lg,
    marginBottom: spacing.md,
    padding: spacing.md,
    borderRadius: radius.lg,
    borderWidth: 1,
  },
  selfText: { flex: 1, gap: 2 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  rank: { width: 32, textAlign: 'right' },
  handle: { flex: 1 },
  empty: { textAlign: 'center', padding: spacing.xxl },
  notice: { textAlign: 'center', padding: spacing.md },
});
