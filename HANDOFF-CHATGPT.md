# EVENGIRL — kaynak paketi (ChatGPT / Claude)

Tarih: 2026-09-01  
Stack: Vite + React + TanStack Start + Zustand + Tailwind (src/styles.css)

## Ne bu?

Kadın odaklı güzellik stüdyosu: foto düzenle, klinik (yüz/vücut), AI oluştur, fal.  
Ana dil İngilizce i18n, UI Türkçe karışık. 18+ tek buton kapısı.

## Çalıştır

```
npm i
npm run dev
```

Önizleme `0.0.0.0:8080`. `npm run build` Vercel çıktısı üretir.

## Önemli dosyalar

- `src/components/app-shell.tsx` — telefon kabuğu + alt menü
- `src/components/legal-gate.tsx` — 18+ giriş
- `src/components/projects-screen.tsx` — logo ana ekran
- `src/components/studio-screen.tsx` — düzenle tuvali
- `src/components/tools-screen.tsx` — klinik
- `src/components/edge-menu.tsx` — soldan açılan işlem menüsü
- `src/lib/store.ts` — durum
- `src/lib/fx.ts` — filtre / warp
- `src/lib/clinic-vision.ts` — yüz ağı
- `src/styles.css` — tüm görünüm (son bloklar kazanan)

## Bilinen UX kuralları (kullanıcı)

- Alt menü ekranın en dibinde (Projeler, Düzenle, Efekt, Oluştur, Fal, Araçlar, Ayarlar)
- Butonlar üst üste binmesin; 9:16 telefona sığsın
- Klinik boş tuvalde Yükle; bej placeholder yüz sayılmaz
- Kaydetmeden efektler üst üste binmesin
- Sol kenar › menü: seçilen işlem tuvalin altına/çevresine yerleşir
- iOS dokunuş: `src/lib/fast-tap.ts` pointerdown
- Klavye açıkken nav gizlenmesin (sadece gerçek input focus)

`node_modules` ve `.env` bu zip’te yok. Anahtarları kullanıcı verir.
