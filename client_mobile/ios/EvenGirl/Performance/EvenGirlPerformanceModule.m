//
//  EvenGirlPerformanceModule.m
//  EvenGirl
//
#import <React/RCTBridgeModule.h>
#import <React/RCTEventEmitter.h>

@interface RCT_EXTERN_MODULE (EvenGirlPerformance, RCTEventEmitter)

RCT_EXTERN_METHOD(startMonitoring)
RCT_EXTERN_METHOD(stopMonitoring)

RCT_EXTERN_METHOD(readSignals:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)

@end
