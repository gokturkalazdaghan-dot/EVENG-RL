package com.evengirl.app.media

import com.facebook.react.ReactPackage
import com.facebook.react.bridge.NativeModule
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.uimanager.ViewManager

/**
 * MainApplication.getPackages() içinde kaydedilir.
 *
 * Kaydedilmezse `NativeModules.EvenGirlMediaPicker` undefined olur ve
 * kullanıcı hiçbir zaman medya seçemez: editör kalıcı olarak boş tuval
 * gösterir, hiçbir hata da vermez.
 */
class MediaPackage : ReactPackage {

    override fun createNativeModules(context: ReactApplicationContext): List<NativeModule> =
        listOf(MediaPickerModule(context), MediaSaverModule(context))

    override fun createViewManagers(context: ReactApplicationContext): List<ViewManager<*, *>> =
        emptyList()
}
