//
//  PinConfiguration.swift
//  EvenGirl
//
//  SPKI pin listesi.
//
//  Pin değerleri gizli DEĞİLDİR (herkes sunucunun sertifikasından hesaplayabilir),
//  bu yüzden binary'de düz metin durmaları sorun değildir.
//
//  Pin nasıl hesaplanır (yayın öncesi çalıştırın ve çıktıyı buraya yazın):
//
//    openssl s_client -servername api.armanalabs.com -connect api.armanalabs.com:443 \
//      | openssl x509 -pubkey -noout \
//      | openssl pkey -pubin -outform der \
//      | openssl dgst -sha256 -binary | openssl enc -base64
//
//  YEDEK PİN: İkinci değer, henüz yayına alınmamış yedek anahtar çiftinin
//  özetidir (CSR üretilip anahtar saklandıktan sonra hesaplanır). Yedek pin
//  olmadan anahtar kaybı = sahadaki tüm kurulumların kalıcı kilitlenmesi.
//
import Foundation

enum PinConfiguration {
    static let pinsByHost: [String: [String]] = [
        "api.armanalabs.com": [
            "sha256/AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=", // aktif
            "sha256/BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB="  // yedek
        ],
        "crash.armanalabs.com": [
            "sha256/CCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCC=",
            "sha256/DDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDD="
        ]
    ]
}
