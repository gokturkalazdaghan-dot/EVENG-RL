/**
 * Kaydırmalı kabuğun rota tanımları.
 *
 * Klasik yığın (stack) navigasyonu yerine SABİT bir sayfa dizisi kullanıyoruz:
 * kullanıcı ekranlar arasında yatay kaydırarak gezer, "geri" düğmesi aramaz.
 * Bu, kategorinin (CapCut/Picsart) yerleşik kalıbıdır.
 *
 * Dizideki SIRA ürün kararıdır: en sık kullanılan ekran (create) başa yakın
 * durur ki her iki yöne de kısa kaydırmayla ulaşılsın. Ayarlar en sonda:
 * nadiren açılır ama kaydırmayla her zaman erişilebilir olmalıdır — destek
 * iletişimini menü içine gömmek, mağaza incelemesinde de sorun çıkarır.
 */
export const TOP_LEVEL_ROUTES = [
  'feed',
  'projects',
  'create',
  'leaderboard',
  'storage',
  'settings',
] as const;

export type TopLevelRoute = (typeof TOP_LEVEL_ROUTES)[number];

/** Açılışta gösterilen sayfa (ortadaki). */
export const INITIAL_ROUTE_INDEX = 2;

/**
 * Düzenleme katmanları — editör içinde DİKEY kaydırma ile geçilir.
 *
 * Yatay = ekranlar arası, dikey = katmanlar arası. Bu ayrım tutarlı olmak
 * zorundadır; aksi halde jest çakışır ve kullanıcı hangi yönün ne yaptığını
 * öğrenemez.
 */
export const EDITOR_LAYERS = ['canvas', 'tools', 'timeline'] as const;

export type EditorLayer = (typeof EDITOR_LAYERS)[number];

export const INITIAL_LAYER_INDEX = 0;

export function clampIndex(index: number, length: number): number {
  'worklet';
  if (index < 0) return 0;
  if (index > length - 1) return length - 1;
  return index;
}
