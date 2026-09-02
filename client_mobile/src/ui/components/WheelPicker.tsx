/**
 * WheelPicker — tek sütunluk kaydırmalı (scroll wheel) seçici.
 *
 * NEDEN KENDİ BİLEŞENİMİZ
 * `@react-native-community/datetimepicker` platformun yerel seçicisini açar;
 * iOS'ta tekerlek, Android'de takvim modalı gösterir. Yaş kapısında iki
 * platformda AYNI ve tam kontrol edilebilir bir deneyim istiyoruz (yıl
 * aralığı, varsayılan konum, erişilebilirlik etiketleri). Ayrıca bu, tek
 * bir ekran için yeni bir native bağımlılık eklemekten daha ucuzdur.
 *
 * PERFORMANS
 * `snapToInterval` ile hizalama UI thread'inde yapılır; JS her karede
 * çağrılmaz. Seçim yalnızca kaydırma DURDUĞUNDA (momentum bitiminde)
 * bildirilir — her kaydırma karesinde setState çağırmak, tam da kaçındığımız
 * köprü trafiğidir.
 */
import React, { useCallback, useEffect, useMemo, useRef } from 'react';
import {
  FlatList,
  StyleSheet,
  Text,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';

import { useTheme } from '@/ui/theme/ThemeProvider';
import { radius, spacing, typography } from '@/ui/theme/tokens';

export const ITEM_HEIGHT = 44;
/** Görünen satır sayısı — tek sayı olmalı ki seçili satır tam ortada dursun. */
export const VISIBLE_ITEMS = 5;

export interface WheelOption {
  readonly value: number;
  readonly label: string;
}

export interface WheelPickerProps {
  readonly options: readonly WheelOption[];
  readonly value: number;
  readonly onChange: (value: number) => void;
  readonly accessibilityLabel: string;
  readonly width?: number;
}

export function WheelPicker({
  options,
  value,
  onChange,
  accessibilityLabel,
  width = 96,
}: WheelPickerProps): React.JSX.Element {
  const theme = useTheme();
  const listRef = useRef<FlatList<WheelOption>>(null);

  const selectedIndex = useMemo(
    () => Math.max(0, options.findIndex((option) => option.value === value)),
    [options, value],
  );

  // Değer dışarıdan değiştiğinde (ör. ay değişince gün sayısı kısalınca)
  // tekerleği hizala. Animasyonsuz: kullanıcı kaydırmadığı hâlde tekerleğin
  // kendiliğinden dönmesi kafa karıştırır.
  useEffect(() => {
    listRef.current?.scrollToOffset({ offset: selectedIndex * ITEM_HEIGHT, animated: false });
  }, [selectedIndex]);

  const handleMomentumEnd = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      const offset = event.nativeEvent.contentOffset.y;
      const index = Math.round(offset / ITEM_HEIGHT);
      const clamped = Math.min(options.length - 1, Math.max(0, index));
      const next = options[clamped];
      if (next && next.value !== value) onChange(next.value);
    },
    [options, value, onChange],
  );

  const listHeight = ITEM_HEIGHT * VISIBLE_ITEMS;
  const padding = (listHeight - ITEM_HEIGHT) / 2;

  return (
    <View style={[styles.root, { width, height: listHeight }]}>
      {/* Seçim penceresi — hangi satırın seçili olduğunu görsel olarak
          işaretler. pointerEvents="none" olmalı, aksi halde kaydırmayı yutar. */}
      <View
        pointerEvents="none"
        style={[
          styles.selectionBand,
          { top: padding, height: ITEM_HEIGHT, borderColor: theme.colors.accent },
        ]}
      />

      <FlatList
        ref={listRef}
        data={options as WheelOption[]}
        keyExtractor={(item) => String(item.value)}
        showsVerticalScrollIndicator={false}
        snapToInterval={ITEM_HEIGHT}
        decelerationRate="fast"
        // getItemLayout olmadan scrollToOffset uzun listelerde (yıl listesi
        // ~120 öğe) yanlış konuma gider.
        getItemLayout={(_, index) => ({
          length: ITEM_HEIGHT,
          offset: ITEM_HEIGHT * index,
          index,
        })}
        contentContainerStyle={{ paddingVertical: padding }}
        onMomentumScrollEnd={handleMomentumEnd}
        // Yavaş bırakmalarda momentum olayı hiç gelmez; bu durumda da
        // seçimin kaydedilmesi için scrollEnd'i de dinliyoruz.
        onScrollEndDrag={handleMomentumEnd}
        accessibilityLabel={accessibilityLabel}
        renderItem={({ item }) => {
          const isSelected = item.value === value;
          return (
            <View style={[styles.item, { height: ITEM_HEIGHT }]}>
              <Text
                style={[
                  isSelected ? typography.heading : typography.body,
                  {
                    color: isSelected ? theme.colors.textPrimary : theme.colors.textDisabled,
                  },
                ]}
              >
                {item.label}
              </Text>
            </View>
          );
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { overflow: 'hidden' },
  selectionBand: {
    position: 'absolute',
    left: 0,
    right: 0,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderRadius: radius.sm,
    zIndex: 1,
  },
  item: { alignItems: 'center', justifyContent: 'center', paddingHorizontal: spacing.xs },
});
