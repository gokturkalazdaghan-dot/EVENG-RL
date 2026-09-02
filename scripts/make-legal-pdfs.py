"""EVENGIRL yasal PDF üreteci → public/legal/

Çıktı yolu DEPOYA GÖRE hesaplanır. Eskiden `/workspace/public/legal` diye
sabitlenmişti; o dizin yalnızca üretildiği makinede vardı, başka her yerde
betik ya sessizce yanlış yere yazıyor ya da hata veriyordu. Ayarlar
ekranındaki iki bağlantı (`/legal/*.pdf`) bu dosyalara gider — üretilmezse
kullanıcı boş sayfa görür.
"""

from pathlib import Path
from fpdf import FPDF

FONT = "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"
BOLD = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"
OUT = Path(__file__).resolve().parent.parent / "public" / "legal"
OUT.mkdir(parents=True, exist_ok=True)

TERMS = [
    ("1. Taraflar",
     "Bu sözleşme EVENGIRL uygulaması (yayımcı: armanalabs) ile uygulamayı kullanan 18 yaşını doldurmuş kişi arasındadır. Stüdyoya girmek, 18+ olduğunu onaylamak ve bu metni kabul etmek demektir."),
    ("2. Ne sunduğumuz",
     "EVENGIRL; fotoğraf düzenleme, efekt, yapay zeka ile görsel/video oluşturma, klinik rötuş ve kahve / el falı / rüya yorumu sunar. Fal ve rüya eğlence ve geleneksel tabirdir; tıp, hukuk veya bağlayıcı kader değildir."),
    ("3. Hesap yok",
     "Kayıt, e-posta, telefon, ad soyad veya kimlik istenmez. Profil adı yalnızca bu cihazda tutulur. Reklam yoktur. Reklam kimliği, izleyici ve konum toplanmaz."),
    ("4. Fotoğraf ve içerik",
     "Galeriden seçtiğiniz görsel tarayıcının dosya seçicisiyle okunur. Düzenleme varsayılan olarak cihazınızda işlenir. Oluştur ve fal için siz gönderirseniz ilgili görsel veya metin, yorumun üretilmesi amacıyla işlenir; kullanıcı hesabına bağlanmaz, reklam için kullanılmaz."),
    ("5. PRO",
     "Haftalık, aylık ve yıllık paketler Google Play Faturalandırma ile satılır. İndirme ve fal PRO ile açılır. İptal ve iade Play kurallarına tabidir."),
    ("6. Yasaklar",
     "18 yaş altı kullanım, başkasının izinsiz sureti, nefret, yasa dışı içerik ve tıbbi/cerrahi vaat yasaktır. Klinik araçlar kozmetik rötuştur, teşhis değildir."),
    ("7. Sorumluluk",
     "Fal, rüya ve güzellik sonuçları yorum ve eğlencedir. armanalabs, bu yorumlara dayanarak alınan kararlardan sorumlu tutulamaz. Hizmet kesintisi olabilir."),
    ("8. Fesih",
     "Uygulamayı silmek veya Ayarlar > Yerel veriyi sil ile bu cihazdaki projeler temizlenir. Sözleşme, kullanımı durdurmanızla sona erer."),
    ("9. İletişim",
     "Geri bildirim: gokturkalazdaghan@gmail.com"),
    ("10. Yürürlük",
     "1 Eylül 2026. Değişiklik bu belgenin yeni sürümüyle duyurulur."),
]

PRIVACY = [
    ("1. İlke",
     "Kişisel bilgilerinizi kaydetmiyoruz. Reklam yok. Gizlilik had safhadadır. Hesap açılmaz. E-posta, telefon, ad, TC kimlik, konum ve reklam kimliği toplanmaz."),
    ("2. Veri sorumlusu",
     "Yerel projelerin sorumlusu sizsiniz. Cihazınızdaki tarayıcı deposu (projeler, PRO durumu, ayarlar) bu telefonda kalır. Yayımcı: armanalabs. İletişim: gokturkalazdaghan@gmail.com"),
    ("3. Toplamadığımız şeyler",
     "Hesap, şifre, adres defteri, rehber, konum, mikrofon sürekli dinleme, reklam kimliği (GAID), çerez reklam ağı, analitik izleyici ve üçüncü taraf reklam SDK’sı yoktur."),
    ("4. Cihazda kalanlar",
     "Seçtiğiniz fotoğraflar, fırça/efekt ayarları, projeler ve fal bekleyişi bu cihazın yerel deposundadır. Silmek için Ayarlar > Yerel veriyi sil veya tarayıcı verisini temizleyin."),
    ("5. Sizin başlattığınız işler",
     "Oluştur: yazdığınız prompt ve varsa referans görsel, görsel/video üretmek için üretim servisine gider. Fal: fincan/el fotoğrafı veya rüya metni, yorum için işlenir. Bu içerik bir kullanıcı profiline yazılmaz, reklam için satılmaz, pazarlama listesine eklenmez."),
    ("6. Ödeme",
     "PRO satın alma Google Play’e aittir. Kart verisi EVENGIRL’e gelmez."),
    ("7. Geri bildirim",
     "Ayarlardaki Geri bildirim, sizin yazdığınız metni gokturkalazdaghan@gmail.com adresine e-posta olarak açar. Göndermezseniz iletilmez."),
    ("8. Çocuklar",
     "Hizmet 18+ içindir. 18 yaş altı veri bilinçli toplanmaz."),
    ("9. Haklar (KVKK)",
     "6698 sayılı KVKK kapsamında erişim, silme ve itiraz: yerel veriyi silmeniz yeterlidir. İşlenen fal/üretim içeriği hesapla tutulmadığı için profil silme diye bir kayıt yoktur."),
    ("10. Güvenlik",
     "Sunucuya hesap yüklenmez. XSS ve enjeksiyon için girdiler süzülür. Reklam ağı yoktur."),
    ("11. Yürürlük",
     "1 Eylül 2026. armanalabs · EVENGIRL"),
]


class Doc(FPDF):
    def header(self):
        self.set_fill_color(255, 79, 163)
        self.rect(0, 0, 210, 18, "F")
        self.set_font("DejaVu", "B", 11)
        self.set_text_color(255, 255, 255)
        self.set_xy(self.l_margin, 5)
        self.cell(self.epw, 8, "EVENGIRL  ·  armanalabs", align="L")
        self.set_y(24)
        self.set_x(self.l_margin)

    def footer(self):
        self.set_y(-14)
        self.set_font("DejaVu", "", 8)
        self.set_text_color(140, 90, 114)
        self.cell(0, 8, f"Sayfa {self.page_no()}  ·  Kişisel veri yok  ·  Reklam yok", align="C")


def write_pdf(path: Path, title: str, sections: list[tuple[str, str]]):
    pdf = Doc()
    pdf.set_auto_page_break(auto=True, margin=18)
    pdf.add_font("DejaVu", "", FONT)
    pdf.add_font("DejaVu", "B", BOLD)
    pdf.add_page()
    pdf.set_x(pdf.l_margin)
    pdf.set_text_color(74, 32, 51)
    pdf.set_font("DejaVu", "B", 18)
    pdf.multi_cell(pdf.epw, 9, title)
    pdf.set_font("DejaVu", "", 10)
    pdf.set_text_color(138, 90, 114)
    pdf.multi_cell(pdf.epw, 6, "Yürürlük: 1 Eylül 2026  ·  18+  ·  Hesap yok  ·  Reklam yok")
    pdf.ln(4)
    for head, body in sections:
        pdf.set_x(pdf.l_margin)
        pdf.set_font("DejaVu", "B", 12)
        pdf.set_text_color(196, 40, 106)
        pdf.multi_cell(pdf.epw, 7, head)
        pdf.set_x(pdf.l_margin)
        pdf.set_font("DejaVu", "", 10.5)
        pdf.set_text_color(74, 32, 51)
        pdf.multi_cell(pdf.epw, 6, body)
        pdf.ln(2)
    pdf.output(path)
    print(path, path.stat().st_size)


write_pdf(OUT / "kullanici-politikasi.pdf", "Kullanıcı politikası / Kullanıcı sözleşmesi", TERMS)
write_pdf(OUT / "gizlilik-politikasi.pdf", "Gizlilik politikası", PRIVACY)
