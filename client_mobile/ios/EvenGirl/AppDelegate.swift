import UIKit
import React
import React_RCTAppDelegate
import ReactAppDependencyProvider

/**
 * Uygulama girişi (iOS).
 *
 * ALTI YEREL MODÜL otomatik bağlanır: iOS'ta `RCT_EXTERN_MODULE` makrosu
 * modülleri çalışma anında kaydeder, Android'deki gibi elle liste
 * gerekmez. Modüllerin `.m` köprü dosyaları Xcode hedefinde OLMALIDIR;
 * hedefe eklenmemiş bir köprü sessizce kaydolmaz ve JS tarafında
 * `NativeModules.EvenGirlSecurity` undefined kalır.
 */
@main
class AppDelegate: RCTAppDelegate {

  override func application(
    _ application: UIApplication,
    didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil
  ) -> Bool {
    // `app.json` içindeki `name` ile AYNI olmalı; farklıysa uygulama boş açılır.
    self.moduleName = "EvenGirl"
    self.dependencyProvider = RCTAppDependencyProvider()
    self.initialProps = [:]

    return super.application(application, didFinishLaunchingWithOptions: launchOptions)
  }

  override func sourceURL(for bridge: RCTBridge) -> URL? {
    self.bundleURL()
  }

  override func bundleURL() -> URL? {
    #if DEBUG
      return RCTBundleURLProvider.sharedSettings()
        .jsBundleURL(forBundleRoot: "index")
    #else
      return Bundle.main.url(forResource: "main", withExtension: "jsbundle")
    #endif
  }
}
