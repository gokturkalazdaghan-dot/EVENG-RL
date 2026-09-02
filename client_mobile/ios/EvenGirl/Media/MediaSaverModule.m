//
//  MediaSaverModule.m
//  EvenGirl
//
#import <React/RCTBridgeModule.h>

@interface RCT_EXTERN_MODULE (EvenGirlMediaSaver, NSObject)

RCT_EXTERN_METHOD(authorizationStatus:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)

RCT_EXTERN_METHOD(save:(NSString *)filePath
                  kind:(NSString *)kind
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)

@end
