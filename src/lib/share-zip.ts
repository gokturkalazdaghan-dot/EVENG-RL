/**
 * "Kaynağı paylaş" — uygulamanın kendi zip'ini kullanıcıya verir.
 *
 * ZIP GÖMÜLÜ DEĞİL, İSTENDİĞİNDE İNDİRİLİR.
 * Eskiden `@/lib/kod-zip` adlı üretilmiş bir modülden base64 dizesi
 * okunuyordu. O dize JS paketinin parçası olduğu için uygulamayı açan
 * HERKES ~440 KB fazladan indiriyordu; düğmeye basan bir avuç kişi için.
 * Şimdi dosya `public/kod/` altında duruyor ve yalnızca basılınca çekiliyor.
 *
 * DOSYA YOKSA SESSİZ KALMAZ. `scripts/make-kod-zip.mjs` çalıştırılmadıysa
 * istek 404 döner. Bunu yutup "paylaşıldı" demek, kullanıcının boş bir
 * dosya paylaştığını sanması demektir — o yüzden hata fırlatılır ve
 * çağıran ekran kendi mesajını gösterir.
 */
const KOD_ZIP_URL = "/kod/EVENGIRL-KOD.zip";
const FILE_NAME = "EVENGIRL-KOD.zip";

async function fetchZip(): Promise<Blob> {
  const res = await fetch(KOD_ZIP_URL, { cache: "no-store" });
  if (!res.ok) throw new Error(`kod zip alınamadı: ${res.status}`);
  const blob = await res.blob();
  // Sunucu 404 yerine SPA index.html döndürebilir; boyut ve tür kontrolü
  // "HTML'i zip diye kaydettik" hatasını engelliyor.
  if (blob.size < 1024) throw new Error("kod zip boş görünüyor");
  return blob;
}

export async function shareKodZip(): Promise<boolean> {
  const blob = await fetchZip();
  const file = new File([blob], FILE_NAME, { type: "application/zip" });
  const nav = navigator as Navigator & {
    canShare?: (d: { files?: File[] }) => boolean;
    share?: (d: { files?: File[]; title?: string }) => Promise<void>;
  };
  try {
    if (nav.canShare?.({ files: [file] }) && nav.share) {
      await nav.share({ files: [file], title: FILE_NAME });
      return true;
    }
  } catch {
    // Kullanıcı paylaş sayfasını kapattı — indirmeye düşülür.
  }
  const url = URL.createObjectURL(file);
  const a = document.createElement("a");
  a.href = url;
  a.download = FILE_NAME;
  a.rel = "noopener";
  a.style.display = "none";
  document.body.appendChild(a);
  a.click();
  window.setTimeout(() => {
    a.remove();
    URL.revokeObjectURL(url);
  }, 4000);
  return true;
}
