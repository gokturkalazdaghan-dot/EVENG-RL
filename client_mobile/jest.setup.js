/**
 * Jest kurulum dosyası — native modül taklitleri (mock).
 *
 * Saf politika testleri native modüle dokunmaz, ama import zinciri onları
 * yükler (EvenGenerate -> AiEngine -> NetworkMonitor -> netinfo). Zinciri
 * kırmak yerine native tarafı taklit etmek, testlerin gerçek import
 * yollarını kullanmasını sağlar.
 */
jest.mock('@react-native-community/netinfo', () => ({
  __esModule: true,
  default: {
    addEventListener: jest.fn(() => jest.fn()),
    fetch: jest.fn(() => Promise.resolve({ isConnected: true, isInternetReachable: true, type: 'wifi' })),
  },
}));

jest.mock('react-native-mmkv', () => ({
  MMKV: class {
    constructor() {
      this.store = new Map();
    }
    getString(key) {
      return this.store.get(key);
    }
    getBoolean(key) {
      return this.store.get(key);
    }
    set(key, value) {
      this.store.set(key, value);
    }
    delete(key) {
      this.store.delete(key);
    }
  },
}));

jest.mock('react-native-fs', () => ({
  __esModule: true,
  default: {
    DocumentDirectoryPath: '/mock/documents',
    CachesDirectoryPath: '/mock/caches',
    mkdir: jest.fn(() => Promise.resolve()),
    exists: jest.fn(() => Promise.resolve(false)),
    readDir: jest.fn(() => Promise.resolve([])),
    unlink: jest.fn(() => Promise.resolve()),
    moveFile: jest.fn(() => Promise.resolve()),
    downloadFile: jest.fn(() => ({ promise: Promise.resolve({ statusCode: 200 }) })),
    hash: jest.fn(() => Promise.resolve('')),
  },
}));

jest.mock('react-native-purchases', () => ({
  __esModule: true,
  default: {
    configure: jest.fn(),
    setLogLevel: jest.fn(() => Promise.resolve()),
    getOfferings: jest.fn(() => Promise.resolve({ all: {}, current: null })),
    getCustomerInfo: jest.fn(() => Promise.resolve({ entitlements: { active: {} }, originalAppUserId: 'anon' })),
    addCustomerInfoUpdateListener: jest.fn(),
    purchasePackage: jest.fn(),
    restorePurchases: jest.fn(),
    checkTrialOrIntroductoryPriceEligibility: jest.fn(() => Promise.resolve({})),
  },
  LOG_LEVEL: { WARN: 'WARN' },
  PURCHASES_ERROR_CODE: { PURCHASE_CANCELLED_ERROR: 'PURCHASE_CANCELLED_ERROR' },
  INTRO_ELIGIBILITY_STATUS: { INTRO_ELIGIBILITY_STATUS_ELIGIBLE: 2 },
}));
