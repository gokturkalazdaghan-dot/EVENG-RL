package com.evengirl.app.storage

import com.facebook.react.ReactPackage
import com.facebook.react.bridge.NativeModule
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.uimanager.ViewManager

/**
 * MainApplication.getPackages() içinde kaydedilir.
 *
 * Kaydedilmezse JS tarafında `NativeModules.EvenGirlCloudDrafts` **undefined**
 * olur; CloudDraftSync `isAvailable === false` döner ve bulut yedekleme
 * arayüzü hiç görünmez — hata da vermez, özellik sessizce yok olur.
 */
class StoragePackage : ReactPackage {

    override fun createNativeModules(context: ReactApplicationContext): List<NativeModule> =
        listOf(CloudDraftsModule(context))

    override fun createViewManagers(context: ReactApplicationContext): List<ViewManager<*, *>> =
        emptyList()
}
