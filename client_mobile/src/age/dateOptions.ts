/**
 * Yaş kapısı tekerleklerinin seçenek listeleri — SAF üreticiler.
 *
 * Gün listesi seçilen ay ve yıla göre DARALIR: Şubat'ta 30-31 göstermek,
 * kullanıcının imkânsız bir tarih seçmesine ve sonra hata almasına yol açar.
 * Doğrulamayı kullanıcıya hata olarak göstermek yerine, geçersiz seçeneği
 * hiç sunmuyoruz.
 */
import type { BirthDate } from '@/age/AgePolicy';
import { MAX_PLAUSIBLE_AGE } from '@/age/AgePolicy';

export interface WheelOption {
  readonly value: number;
  readonly label: string;
}

/** Seçilen ay ve yıldaki gün sayısı (artık yıl dahil). */
export function daysInMonth(month: number, year: number): number {
  // Ayın 0. günü = bir önceki ayın son günü.
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

export function dayOptions(month: number, year: number): WheelOption[] {
  return Array.from({ length: daysInMonth(month, year) }, (_, index) => ({
    value: index + 1,
    label: String(index + 1).padStart(2, '0'),
  }));
}

export function monthOptions(monthNames: readonly string[]): WheelOption[] {
  return monthNames.map((label, index) => ({ value: index + 1, label }));
}

/**
 * Yıl listesi. En yeni yıl BAŞTA değil: liste kronolojik olmalı ki tekerlek
 * doğal yönde dönsün. Varsayılan konum ayrıca belirlenir.
 */
export function yearOptions(nowMs: number): WheelOption[] {
  const currentYear = new Date(nowMs).getUTCFullYear();
  const oldest = currentYear - MAX_PLAUSIBLE_AGE;
  return Array.from({ length: currentYear - oldest + 1 }, (_, index) => ({
    value: oldest + index,
    label: String(oldest + index),
  }));
}

/**
 * Tekerleklerin açılışta duracağı tarih.
 *
 * Bugünün tarihi DEĞİL: bu, "0 yaşında" bir varsayılan demektir ve kullanıcıyı
 * en uzağa kaydırmaya zorlar. Aynı şekilde tam 18 yaş öncesi de seçilmez —
 * varsayılanı eşiğe koymak, kullanıcıyı hiç kaydırmadan onaylamaya iter.
 * 25 yaş, tipik kullanıcıya en yakın nötr başlangıçtır.
 */
export const DEFAULT_START_AGE = 25;

export function defaultBirthDate(nowMs: number): BirthDate {
  const today = new Date(nowMs);
  return {
    day: 1,
    month: 1,
    year: today.getUTCFullYear() - DEFAULT_START_AGE,
  };
}

/**
 * Ay veya yıl değiştiğinde günü geçerli aralığa çeker.
 * 31 Ocak seçiliyken Şubat'a geçilirse gün 28/29'a düşer.
 */
export function clampDay(birth: BirthDate): BirthDate {
  const maxDay = daysInMonth(birth.month, birth.year);
  return birth.day > maxDay ? { ...birth, day: maxDay } : birth;
}
