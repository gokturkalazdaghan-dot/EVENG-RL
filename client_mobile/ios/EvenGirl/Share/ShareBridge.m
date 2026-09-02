//
//  ShareBridge.m
//  EvenGirl
//
#import <React/RCTBridgeModule.h>

@interface RCT_EXTERN_MODULE (EvenGirlShare, NSObject)

RCT_EXTERN_METHOD(shareToInstagramStories:(NSDictionary *)input
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)

RCT_EXTERN_METHOD(shareToWhatsApp:(NSDictionary *)input
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)

RCT_EXTERN_METHOD(isInstalled:(NSString *)target
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)

@end
