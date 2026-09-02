/**
 * Test yapılandırması.
 *
 * KAPSAM ODAĞI: Bileşen anlık görüntüleri (snapshot) yerine SAF KARAR
 * MANTIĞI test edilir — termal profil merdiveni ve önbellek eviction planı.
 * Bu iki mantıktaki hatalar sessizdir: biri cihazı ısıtır, diğeri kullanıcının
 * emeğini siler. İkisi de log'da görünmez, yalnızca kullanıcı fark eder.
 */
module.exports = {
  preset: 'react-native',
  testEnvironment: 'node',
  setupFiles: ['<rootDir>/jest.setup.js'],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
  },
  testMatch: ['<rootDir>/__tests__/**/*.test.ts'],
  collectCoverageFrom: [
    'src/performance/ThermalPolicy.ts',
    'src/storage/CachePolicy.ts',
  ],
};
