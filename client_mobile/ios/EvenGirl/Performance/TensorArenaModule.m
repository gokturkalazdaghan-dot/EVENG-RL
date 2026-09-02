//
//  TensorArenaModule.m
//  EvenGirl
//
#import <React/RCTBridgeModule.h>

@interface RCT_EXTERN_MODULE (EvenGirlTensor, NSObject)

RCT_EXTERN_METHOD(allocate:(NSString *)arenaId
                  bytes:(nonnull NSNumber *)bytes
                  label:(NSString *)label
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)

RCT_EXTERN_METHOD(release:(nonnull NSNumber *)handle
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)

RCT_EXTERN_METHOD(releaseAll:(NSString *)arenaId
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)

RCT_EXTERN_METHOD(nativeHeapUsedBytes:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)

@end
