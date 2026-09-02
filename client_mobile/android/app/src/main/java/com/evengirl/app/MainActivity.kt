package com.evengirl.app

import android.os.Bundle
import com.facebook.react.ReactActivity
import com.facebook.react.ReactActivityDelegate
import com.facebook.react.defaults.DefaultNewArchitectureEntryPoint.fabricEnabled
import com.facebook.react.defaults.DefaultReactActivityDelegate

class MainActivity : ReactActivity() {

  /** `app.json` içindeki `name` ile AYNI olmalı; farklıysa uygulama boş açılır. */
  override fun getMainComponentName(): String = "EvenGirl"

  override fun createReactActivityDelegate(): ReactActivityDelegate =
    DefaultReactActivityDelegate(this, mainComponentName, fabricEnabled)

  /**
   * `super.onCreate(null)` — KASITLI.
   *
   * Kaydedilmiş durumu geri yüklemek, React Native'de parçalanmış fragment
   * durumuyla açılan bir ekran üretir (yaygın "black screen after rotation"
   * hatası). RN kendi durumunu JS tarafında tutar.
   */
  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(null)
  }
}
