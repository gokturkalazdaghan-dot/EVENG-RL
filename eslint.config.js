/**
 * ESLint yapılandırması.
 *
 * Devir zip'inde yoktu ve `npm run lint` şu hatayla ölüyordu:
 * "ESLint couldn't find an eslint.config.(js|mjs|cjs) file". Paket
 * bağımlılıkları (typescript-eslint, react-hooks, react-refresh, prettier)
 * zaten kuruluydu — yalnızca onları bağlayan dosya eksikti.
 *
 * KAPSAM DIŞI BIRAKILANLAR bilinçli: üretilen dosyalar (routeTree.gen.ts,
 * derleme çıktıları, public/) lint edilmez. Üretilmiş kodu lint etmek,
 * düzeltilemeyecek uyarılar üretir ve zamanla tüm çıktının susturulmasına
 * yol açar.
 */
import js from "@eslint/js";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import tseslint from "typescript-eslint";
import prettier from "eslint-config-prettier";

export default tseslint.config(
  {
    ignores: [
      "dist/**",
      ".output/**",
      ".vercel/**",
      ".nitro/**",
      ".smoke/**",
      "node_modules/**",
      "public/**",
      "src/routeTree.gen.ts",
    ],
  },

  js.configs.recommended,
  ...tseslint.configs.recommended,

  {
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      ecmaVersion: 2022,
      globals: { ...globals.browser, ...globals.node },
    },
    plugins: {
      "react-hooks": reactHooks,
      "react-refresh": reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      "react-refresh/only-export-components": ["warn", { allowConstantExport: true }],
      // Kullanılmayan değişken HATA, ama `_` önekli olan kasıtlı sayılır —
      // yakalanan ama incelenmeyen hatalar için (`catch (_e)`).
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_", caughtErrorsIgnorePattern: "^_" },
      ],
      // `any` bu depoda birkaç yerde tarayıcı API'lerini daraltmak için
      // kullanılıyor; hata değil uyarı — ama görünür kalsın.
      "@typescript-eslint/no-explicit-any": "warn",
    },
  },

  {
    files: ["scripts/**/*.mjs", "*.config.{js,mjs,ts}"],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "module",
      globals: globals.node,
    },
  },

  // Prettier EN SONDA: biçimle çakışan tüm kuralları kapatır.
  prettier,
);
