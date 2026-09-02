//
//  ImageBufferRegistry.swift
//  EvenGirl
//
//  Aktif tam çözünürlük görüntü tamponlarının kaydı ve ANINDA boşaltılması.
//
//  SORUN
//  Kalkanı göstermek ekranı kapatır ama BELLEĞİ temizlemez. Tam çözünürlük,
//  filigransız bir CGImage bellekte dururken:
//    - kalkan çizilene kadar geçen karelerde kayda girebilir,
//    - uygulama arka plana alındığında sistem anlık görüntüsü (snapshot)
//      alır ve bu görüntü diskte saklanır,
//    - bir bellek dökümü ham pikselleri taşır.
//
//  Bu yüzden yakalama algılandığında kalkan gösterilir VE tamponlar
//  boşaltılır. İkisinden yalnızca birini yapmak, korumanın yarısıdır.
//
//  ZAYIF REFERANS
//  Kayıt tamponlara GÜÇLÜ referans tutsaydı, bu sınıfın kendisi sızıntı
//  kaynağı olurdu: kimse serbest bırakmadığı için hiçbir görüntü boşalmazdı.
//  `NSHashTable.weakObjects` görüntü sahibi serbest bırakıldığında kaydı da
//  düşürür.
//
import Foundation
import UIKit

/// Boşaltılabilir bir görüntü tamponu sahibi.
@objc
protocol PurgeableImageBuffer: AnyObject {
    /// Çözülmüş pikselleri serbest bırakır ve görünümü boşaltır.
    /// Çağrıldıktan sonra görünüm yeniden yüklenene kadar boş kalmalıdır.
    func purgeDecodedImage()
}

@objc(EvenGirlImageBufferRegistry)
final class ImageBufferRegistry: NSObject {

    @objc static let shared = ImageBufferRegistry()

    private let buffers = NSHashTable<AnyObject>.weakObjects()
    private let lock = NSLock()

    private override init() { super.init() }

    /// Tam çözünürlük görüntü tutan her görünüm/işlemci burada kaydolur.
    @objc
    func register(_ buffer: PurgeableImageBuffer) {
        lock.lock()
        defer { lock.unlock() }
        buffers.add(buffer)
    }

    @objc
    func unregister(_ buffer: PurgeableImageBuffer) {
        lock.lock()
        defer { lock.unlock() }
        buffers.remove(buffer)
    }

    /// Şu anda korunan bir tampon var mı (politika bağlamı için).
    @objc
    var hasActiveBuffers: Bool {
        lock.lock()
        defer { lock.unlock() }
        return buffers.allObjects.isEmpty == false
    }

    /// TÜM tamponları boşaltır.
    ///
    /// ANA THREAD'DE ve SENKRON çalışır. `DispatchQueue.main.async` ile
    /// ertelemek, boşaltmayı bir sonraki çalışma döngüsüne atar — tam olarak
    /// korumaya çalıştığımız karelerin çizildiği yere.
    @objc
    func purgeAll() {
        let targets: [PurgeableImageBuffer] = {
            lock.lock()
            defer { lock.unlock() }
            return buffers.allObjects.compactMap { $0 as? PurgeableImageBuffer }
        }()

        let purge = {
            targets.forEach { $0.purgeDecodedImage() }
            // URL önbelleği de tam çözünürlük veri taşıyabilir.
            URLCache.shared.removeAllCachedResponses()
        }

        if Thread.isMainThread {
            purge()
        } else {
            DispatchQueue.main.sync(execute: purge)
        }
    }
}

/// Tam çözünürlük çıktıyı gösteren görünüm için hazır uygulama.
///
/// `UIImageView` alt sınıfı: kayıt/kayıttan çıkış otomatik, boşaltma tek
/// satır. Her ekranın kendi boşaltma mantığını yazması, birinin unutması
/// demektir.
@objc(EvenGirlProtectedImageView)
final class ProtectedImageView: UIImageView, PurgeableImageBuffer {

    /// Boşaltma sonrası yeniden yükleme için kaynak referansı (piksel DEĞİL).
    @objc var reloadHandler: (() -> UIImage?)?

    override init(frame: CGRect) {
        super.init(frame: frame)
        ImageBufferRegistry.shared.register(self)
    }

    @available(*, unavailable)
    required init?(coder: NSCoder) {
        fatalError("init(coder:) kullanılmıyor")
    }

    func purgeDecodedImage() {
        image = nil
        // Katmandaki çözülmüş kopya da bırakılır; yalnızca `image = nil`
        // demek, layer.contents'ta bir kopyanın kalmasına izin verebilir.
        layer.contents = nil
    }

    /// Kalkan kalktığında çağrılır.
    @objc
    func restoreImage() {
        image = reloadHandler?()
    }

    deinit {
        ImageBufferRegistry.shared.unregister(self)
    }
}
