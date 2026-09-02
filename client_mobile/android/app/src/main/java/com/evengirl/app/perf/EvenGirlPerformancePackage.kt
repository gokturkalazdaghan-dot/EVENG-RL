package com.evengirl.app.perf

import com.facebook.react.ReactPackage
import com.facebook.react.bridge.NativeModule
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.uimanager.ViewManager

/**
 * MainApplication.getPackages() içinde kaydedilir:
 *
 *   override fun getPackages(): List<ReactPackage> =
 *       PackageList(this).packages.apply {
 *           add(EvenGirlSecurityPackage())
 *           add(EvenGirlPerformancePackage())
 *       }
 */
class EvenGirlPerformancePackage : ReactPackage {

    override fun createNativeModules(context: ReactApplicationContext): List<NativeModule> =
        listOf(
            EvenGirlPerformanceModule(context),
            // Kaydedilmezse JS tarafında NativeModules.EvenGirlTensor undefined
            // olur ve TensorArena sessizce -1 döndürüp ayırdığını sanır.
            TensorArenaModule(context),
        )

    override fun createViewManagers(context: ReactApplicationContext): List<ViewManager<*, *>> =
        emptyList()
}
