package com.evengirl.app.inference

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
 *           add(PlayBillingPackage())
 *           add(InferencePackage())
 *       }
 */
class InferencePackage : ReactPackage {

    override fun createNativeModules(context: ReactApplicationContext): List<NativeModule> =
        listOf(TFLiteRuntime(context))

    override fun createViewManagers(context: ReactApplicationContext): List<ViewManager<*, *>> =
        emptyList()
}
