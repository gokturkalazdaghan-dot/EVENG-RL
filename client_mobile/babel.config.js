/**
 * Reanimated plugin listenin EN SONUNDA olmak zorunda — aksi halde worklet
 * dönüşümü uygulanmaz ve kaydırma animasyonları JS thread'e düşerek 60/120 FPS
 * hedefini kaybeder.
 */
module.exports = {
  presets: ['module:@react-native/babel-preset'],
  plugins: [
    [
      'module-resolver',
      {
        root: ['./src'],
        alias: { '@': './src' },
        extensions: ['.ts', '.tsx', '.js', '.json'],
      },
    ],
    'react-native-reanimated/plugin',
  ],
};
