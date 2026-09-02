//
//  ScreenGuard.m
//  EvenGirl
//
#import <React/RCTBridgeModule.h>
#import <React/RCTEventEmitter.h>

@interface RCT_EXTERN_MODULE (EvenGirlScreenGuard, RCTEventEmitter)

RCT_EXTERN_METHOD(enableCaptureProtection)
RCT_EXTERN_METHOD(disableCaptureProtection)

RCT_EXTERN_METHOD(isCaptured:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)

// Kalkan metinleri JS'ten gelir: dil senkronu tek yerde kalsın diye.
RCT_EXTERN_METHOD(setGateStrings:(NSString *)title
                  body:(NSString *)body
                  actionTitle:(nullable NSString *)actionTitle)

// Bellekteki tam çözünürlük tamponlarını boşaltır.
RCT_EXTERN_METHOD(purgeImageBuffers)

RCT_EXTERN_METHOD(hasProtectedBuffer:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)

// Kalkanı kaldırır (abonelik alındı veya kayıt durdu).
RCT_EXTERN_METHOD(dismissGate)

@end
