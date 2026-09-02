//
//  KeychainStore.swift
//  EvenGirl
//
//  Hassas kısa ömürlü değerlerin (entitlement token'ı, model lisansı) tek
//  saklama yeri.
//
//  ERİŞİM SINIFI SEÇİMİ
//  `kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly`:
//   - AfterFirstUnlock: arka planda yenileme (background refresh) sırasında
//     cihaz kilitliyken de okunabilmesi gerekir.
//   - ThisDeviceOnly: iCloud Keychain ile senkronize OLMAZ ve şifreli yedeğe
//     dahil edilmez. Yedekten dönen bir cihazda token'ın canlanması istenmez.
//
import Foundation
import Security

enum KeychainError: Error {
    case unexpectedStatus(OSStatus)
    case encodingFailed
}

enum KeychainStore {

    private static let service = "com.evengirl.app.secure"

    private static func baseQuery(for key: String) -> [String: Any] {
        [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: key
        ]
    }

    static func set(_ value: String, for key: String) throws {
        guard let data = value.data(using: .utf8) else { throw KeychainError.encodingFailed }

        // Upsert: önce sil, sonra ekle. SecItemUpdate ile erişim sınıfını
        // değiştirmek bazı iOS sürümlerinde sessizce başarısız olur.
        SecItemDelete(baseQuery(for: key) as CFDictionary)

        var query = baseQuery(for: key)
        query[kSecValueData as String] = data
        query[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly

        let status = SecItemAdd(query as CFDictionary, nil)
        guard status == errSecSuccess else { throw KeychainError.unexpectedStatus(status) }
    }

    static func get(_ key: String) throws -> String? {
        var query = baseQuery(for: key)
        query[kSecReturnData as String] = true
        query[kSecMatchLimit as String] = kSecMatchLimitOne

        var item: CFTypeRef?
        let status = SecItemCopyMatching(query as CFDictionary, &item)

        if status == errSecItemNotFound { return nil }
        guard status == errSecSuccess, let data = item as? Data else {
            throw KeychainError.unexpectedStatus(status)
        }
        return String(data: data, encoding: .utf8)
    }

    static func delete(_ key: String) throws {
        let status = SecItemDelete(baseQuery(for: key) as CFDictionary)
        guard status == errSecSuccess || status == errSecItemNotFound else {
            throw KeychainError.unexpectedStatus(status)
        }
    }

    /// Uygulama silinip yeniden kurulduğunda Keychain kayıtları SİLİNMEZ.
    /// İlk açılışta bu artıkları temizlemek, "eski kullanıcının token'ı yeni
    /// kurulumda canlandı" sınıfı hataları önler.
    static func purgeAll() {
        SecItemDelete([
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service
        ] as CFDictionary)
    }
}
