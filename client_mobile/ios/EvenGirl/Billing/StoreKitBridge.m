//
//  StoreKitBridge.m
//  EvenGirl
//
#import <React/RCTBridgeModule.h>
#import <React/RCTEventEmitter.h>

@interface RCT_EXTERN_MODULE (EvenGirlStoreKit, RCTEventEmitter)

RCT_EXTERN_METHOD(startTransactionListener)
RCT_EXTERN_METHOD(stopTransactionListener)

RCT_EXTERN_METHOD(showManageSubscriptions:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)

RCT_EXTERN_METHOD(beginRefundRequest:(nonnull NSNumber *)transactionId
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)

RCT_EXTERN_METHOD(isEligibleForIntroOffer:(NSString *)productId
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)

@end
