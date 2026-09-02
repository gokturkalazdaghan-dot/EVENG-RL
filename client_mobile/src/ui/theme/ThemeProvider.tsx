/**
 * ThemeProvider — dark/light şeması ve hareket profilinin dağıtımı.
 *
 * İKİ GİRDİ:
 *   1. Sistem teması (useColorScheme) veya kullanıcının açık seçimi.
 *   2. ThermalGovernor'ın aktif güç profili — 'saver'/'critical' iken hareket
 *      profili otomatik olarak 'reduced'a düşer.
 *
 * İkinci madde, "batarya koruma modu" ile arayüzü birbirine bağlayan yerdir:
 * cihaz ısındığında yalnızca AI işleri değil, animasyonların kare maliyeti de
 * azalır. Kullanıcı erişilebilirlik ayarında hareketi azaltmışsa
 * (reduceMotion) bu tercih her zaman kazanır.
 */
import React, {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type PropsWithChildren,
} from 'react';
import { AccessibilityInfo, useColorScheme } from 'react-native';

import { ThermalGovernor } from '@/performance/ThermalGovernor';
import type { PowerProfileId } from '@/performance/PowerProfile';
import {
  motion,
  palette,
  type ColorScheme,
  type Colors,
  type MotionProfile,
} from '@/ui/theme/tokens';

export interface Theme {
  readonly scheme: ColorScheme;
  readonly colors: Colors;
  readonly motionProfile: MotionProfile;
  readonly motion: (typeof motion)[MotionProfile];
  /** Erişilebilirlik: kullanıcı hareketi azaltmayı seçmiş mi. */
  readonly reduceMotion: boolean;
  readonly powerProfile: PowerProfileId;
}

const ThemeContext = createContext<Theme | null>(null);

export interface ThemeProviderProps {
  /** Kullanıcının açık tercihi; 'system' ise cihaz ayarı izlenir. */
  preference?: ColorScheme | 'system';
}

export function ThemeProvider({
  children,
  preference = 'system',
}: PropsWithChildren<ThemeProviderProps>): React.JSX.Element {
  const systemScheme = useColorScheme();
  const [powerProfile, setPowerProfile] = useState<PowerProfileId>(ThermalGovernor.profileId);
  const [reduceMotion, setReduceMotion] = useState(false);

  useEffect(() => ThermalGovernor.subscribe((budget) => setPowerProfile(budget.id)), []);

  useEffect(() => {
    let cancelled = false;
    void AccessibilityInfo.isReduceMotionEnabled().then((enabled) => {
      if (!cancelled) setReduceMotion(enabled);
    });

    const subscription = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduceMotion);
    return () => {
      cancelled = true;
      subscription.remove();
    };
  }, []);

  const theme = useMemo<Theme>(() => {
    // SİSTEM BİLİNMİYORSA AÇIK TEMA.
    //
    // Eskiden `systemScheme === 'light' ? 'light' : 'dark'` yazıyordu:
    // `useColorScheme()` ilk karede `null` döndüğü için uygulama HER
    // AÇILIŞTA bir an koyu açılıyor, sonra açığa atlıyordu. Sistem koyu
    // isterse zaten 'dark' geliyor; belirsizliği koyuya çevirmek için bir
    // sebep yok.
    const scheme: ColorScheme =
      preference === 'system' ? (systemScheme === 'dark' ? 'dark' : 'light') : preference;

    const constrained = powerProfile === 'saver' || powerProfile === 'critical';
    const motionProfile: MotionProfile = reduceMotion || constrained ? 'reduced' : 'standard';

    return {
      scheme,
      colors: palette[scheme],
      motionProfile,
      motion: motion[motionProfile],
      reduceMotion,
      powerProfile,
    };
  }, [preference, systemScheme, powerProfile, reduceMotion]);

  return <ThemeContext.Provider value={theme}>{children}</ThemeContext.Provider>;
}

export function useTheme(): Theme {
  const theme = useContext(ThemeContext);
  if (!theme) {
    throw new Error('useTheme, ThemeProvider dışında çağrıldı.');
  }
  return theme;
}
