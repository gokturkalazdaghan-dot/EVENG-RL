//
//  RedemptionBridge.m
//  EvenGirl
//
#import <React/RCTBridgeModule.h>

@interface RCT_EXTERN_MODULE (EvenGirlRedemption, NSObject)

RCT_EXTERN_METHOD(isSupported:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)

RCT_EXTERN_METHOD(presentCodeRedemptionSheet:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)

@end
