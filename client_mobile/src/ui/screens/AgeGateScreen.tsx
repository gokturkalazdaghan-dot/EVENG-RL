/**
 * AgeGateScreen — zorunlu yaş doğrulama duvarı.
 *
 * AKIŞ İÇİNDEKİ YERİ: Güvenlik kontrolünden SONRA, uygulama kabuğundan ÖNCE.
 * Kapı geçilmeden hiçbir içerik monte edilmez — kısa bir an bile olsa akışı
 * göstermek, tam olarak engellemeye çalıştığımız şeydir.
 *
 * TASARIM KARARLARI
 *   - Üç tekerlek (gün / ay / yıl), platformlar arası aynı deneyim.
 *   - Geçersiz tarih ÜRETİLEMEZ: gün listesi seçilen ay ve yıla göre daralır.
 *     Kullanıcıya "31 Şubat geçersiz" demek yerine 31'i hiç göstermiyoruz.
 *   - Varsayılan tarih 18 eşiğinde DEĞİL: eşiğe koymak, kullanıcıyı hiç
 *     kaydırmadan onaylamaya iter ve doğrulamayı anlamsızlaştırır.
 *   - "18 yaşından büyüğüm" onay kutusu YOK. Tek dokunuşluk beyan, hem
 *     mağazaların ciddiye aldığı bir doğrulama değildir hem de çocuğun
 *     tıklaması için sıfır sürtünme demektir.
 *   - Gizlilik notu ekranda: doğum tarihi saklanmaz, cihazdan çıkmaz.
 */
import React, { useCallback, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { Button } from '@/ui/components/Button';
import { AgeGate } from '@/age/AgeGate';
import type { AgeRejection, BirthDate } from '@/age/AgePolicy';
import { clampDay, dayOptions, defaultBirthDate, monthOptions, yearOptions } from '@/age/dateOptions';
import { WheelPicker } from '@/ui/components/WheelPicker';
import { useTheme } from '@/ui/theme/ThemeProvider';
import { radius, spacing, typography } from '@/ui/theme/tokens';

export interface AgeGateScreenProps {
  /** Doğrulama tamamlandığında çağrılır; kademe AgeGate üzerinden okunur. */
  readonly onVerified: () => void;
}

export function AgeGateScreen({ onVerified }: AgeGateScreenProps): React.JSX.Element {
  const { t } = useTranslation();
  const theme = useTheme();

  const now = useMemo(() => Date.now(), []);
  const [birth, setBirth] = useState<BirthDate>(() => defaultBirthDate(now));
  const [rejection, setRejection] = useState<AgeRejection | null>(null);
  const [busy, setBusy] = useState(false);

  const months = useMemo(
    () => monthOptions(t('age.months', { returnObjects: true }) as string[]),
    [t],
  );
  const years = useMemo(() => yearOptions(now), [now]);
  const days = useMemo(() => dayOptions(birth.month, birth.year), [birth.month, birth.year]);

  /** Her değişimde günü geçerli aralığa çekiyoruz (31 Ocak -> Şubat = 28/29). */
  const update = useCallback((patch: Partial<BirthDate>) => {
    setRejection(null);
    setBirth((current) => clampDay({ ...current, ...patch }));
  }, []);

  const confirm = useCallback(async () => {
    setBusy(true);
    try {
      const decision = await AgeGate.submit(birth, now);
      if (!decision.ok) {
        setRejection(decision.reason);
        return;
      }
      onVerified();
    } finally {
      setBusy(false);
    }
  }, [birth, now, onVerified]);

  return (
    <ScrollView
      style={{ backgroundColor: theme.colors.background }}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      <Text style={[typography.title, { color: theme.colors.textPrimary }]}>
        {t('age.title')}
      </Text>
      <Text style={[typography.body, { color: theme.colors.textSecondary }]}>
        {t('age.subtitle')}
      </Text>

      <View
        style={[
          styles.wheels,
          { backgroundColor: theme.colors.surface, borderColor: theme.colors.border },
        ]}
      >
        <Labelled label={t('age.day')}>
          <WheelPicker
            options={days}
            value={birth.day}
            onChange={(day) => update({ day })}
            accessibilityLabel={t('age.day')}
            width={72}
          />
        </Labelled>

        <Labelled label={t('age.month')}>
          <WheelPicker
            options={months}
            value={birth.month}
            onChange={(month) => update({ month })}
            accessibilityLabel={t('age.month')}
            width={128}
          />
        </Labelled>

        <Labelled label={t('age.year')}>
          <WheelPicker
            options={years}
            value={birth.year}
            onChange={(year) => update({ year })}
            accessibilityLabel={t('age.year')}
            width={88}
          />
        </Labelled>
      </View>

      {rejection ? (
        <Text style={[typography.caption, { color: theme.colors.danger }]}>
          {t(`age.error.${rejection}`)}
        </Text>
      ) : null}

      <Button label={t('age.confirm')} busy={busy} onPress={() => void confirm()} />

      <Text style={[typography.caption, styles.privacyNote, { color: theme.colors.textDisabled }]}>
        {t('age.privacyNote')}
      </Text>
    </ScrollView>
  );
}

function Labelled({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}): React.JSX.Element {
  const theme = useTheme();
  return (
    <View style={styles.column}>
      <Text style={[typography.label, { color: theme.colors.textSecondary }]}>
        {label.toUpperCase()}
      </Text>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  content: { padding: spacing.lg, paddingTop: spacing.xxl, gap: spacing.md },
  wheels: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: spacing.sm,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    padding: spacing.md,
    marginTop: spacing.lg,
  },
  column: { alignItems: 'center', gap: spacing.xs },
  confirmButton: {
    height: 52,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: spacing.lg,
  },
  confirmLabel: { color: '#FFFFFF', fontWeight: '600' },
  privacyNote: { textAlign: 'center', marginTop: spacing.sm },
});
