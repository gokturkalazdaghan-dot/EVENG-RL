#!/usr/bin/env node
/**
 * Hassas sabitleri XOR'layıp Swift ve Kotlin kaynak dosyalarına gömer.
 *
 * Kullanım: node tools/gen-obfuscated-strings.mjs
 * Çıktılar (ikisi de üretilmiş dosyadır, ELLE DÜZENLENMEZ):
 *   ios/EvenGirl/Security/ObfuscatedConstants.swift
 *   android/app/src/main/java/com/evengirl/app/security/ObfuscatedConstants.kt
 *
 * CI kontrolü: `node tools/gen-obfuscated-strings.mjs --check` üretilen çıktı
 * ile commit'lenen dosya farklıysa 1 döner (JSON güncellenip generator
 * çalıştırılmayı unutulmuşsa build'i kırar).
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const spec = JSON.parse(readFileSync(join(here, 'obfuscated-strings.json'), 'utf8'));
const KEY = spec.key;
const CHECK_ONLY = process.argv.includes('--check');

/** UTF-8 baytlarını dönüşümlü anahtar baytıyla XOR'lar. */
function encode(value) {
  return [...Buffer.from(value, 'utf8')].map((b, i) => b ^ KEY[i % KEY.length]);
}

/** Round-trip doğrulaması — üretilen bayt dizisi geri çözülmezse build durur. */
function decode(bytes) {
  return Buffer.from(bytes.map((b, i) => b ^ KEY[i % KEY.length])).toString('utf8');
}

function assertRoundTrip(name, value) {
  const bytes = encode(value);
  const back = decode(bytes);
  if (back !== value) {
    throw new Error(`Round-trip başarısız: ${name} ("${value}" -> "${back}")`);
  }
  return bytes;
}

const hex = (bytes) => bytes.map((b) => `0x${b.toString(16).padStart(2, '0').toUpperCase()}`);

const BANNER = [
  '// ÜRETİLMİŞ DOSYA — ELLE DÜZENLEMEYİN.',
  '// Kaynak: tools/obfuscated-strings.json',
  '// Yeniden üretmek için: npm run gen:obf',
  '//',
  '// Buradaki baytlar XOR ile maskelenmiştir. Bu bir şifreleme değildir; amaç',
  '// `strings` ile jailbreak/root tespit sabitlerinin saniyeler içinde bulunup',
  '// yamalanmasını engellemektir. Gerçek koruma, kontrollerin çokluğunda ve',
  '// puanlama mantığının dağıtık olmasındadır.',
].join('\n');

// ---------------------------------------------------------------- Swift ----

function swiftArray(name, values) {
  const rows = values
    .map((v) => `        [${hex(assertRoundTrip(name, v)).join(', ')}], // ${v}`)
    .join('\n');
  return `    static let ${name}: [[UInt8]] = [\n${rows}\n    ]`;
}

function swiftScalar(name, value) {
  return `    // ${value}\n    static let ${name}: [UInt8] = [${hex(assertRoundTrip(name, value)).join(', ')}]`;
}

function buildSwift(c) {
  return `${BANNER}

import Foundation

enum Obf {
    static let key: [UInt8] = [${hex(KEY).join(', ')}]

    static func str(_ bytes: [UInt8]) -> String {
        var out = [UInt8]()
        out.reserveCapacity(bytes.count)
        for (i, b) in bytes.enumerated() { out.append(b ^ key[i % key.count]) }
        return String(decoding: out, as: UTF8.self)
    }

    static func strings(_ list: [[UInt8]]) -> [String] { list.map(str) }

${swiftArray('jailbreakPaths', c.jailbreakPaths)}

${swiftScalar('jailbreakUrlScheme', c.jailbreakUrlScheme)}

${swiftScalar('sandboxProbePath', c.sandboxProbePath)}

${swiftArray('hookLibrarySignatures', c.hookLibrarySignatures)}

${swiftScalar('expectedBundleId', c.expectedBundleId)}
}
`;
}

// --------------------------------------------------------------- Kotlin ----

function kotlinArray(name, values) {
  const rows = values
    .map((v) => `        byteArrayOf(${hex(assertRoundTrip(name, v)).map((h) => `${h}.toByte()`).join(', ')}), // ${v}`)
    .join('\n');
  return `    val ${name}: Array<ByteArray> = arrayOf(\n${rows}\n    )`;
}

function kotlinScalar(name, value) {
  const body = hex(assertRoundTrip(name, value)).map((h) => `${h}.toByte()`).join(', ');
  return `    // ${value}\n    val ${name}: ByteArray = byteArrayOf(${body})`;
}

function buildKotlin(c) {
  return `${BANNER}

package com.evengirl.app.security

internal object Obf {
    private val key = byteArrayOf(${hex(KEY).map((h) => `${h}.toByte()`).join(', ')})

    fun str(bytes: ByteArray): String {
        val out = ByteArray(bytes.size)
        for (i in bytes.indices) out[i] = (bytes[i].toInt() xor key[i % key.size].toInt()).toByte()
        return String(out, Charsets.UTF_8)
    }

    fun strings(list: Array<ByteArray>): List<String> = list.map { str(it) }

${kotlinArray('rootBinaryPaths', c.rootBinaryPaths)}

${kotlinArray('rootPackageNames', c.rootPackageNames)}

${kotlinArray('hookLibrarySignatures', c.hookLibrarySignatures)}

${kotlinScalar('expectedApplicationId', c.expectedApplicationId)}

${kotlinScalar('fridaThreadName', c.fridaThreadName)}

${kotlinScalar('fridaLibraryName', c.fridaLibraryName)}
}
`;
}

// ----------------------------------------------------------------- main ----

const outputs = [
  [join(here, '..', 'ios', 'EvenGirl', 'Security', 'ObfuscatedConstants.swift'), buildSwift(spec.constants)],
  [join(here, '..', 'android', 'app', 'src', 'main', 'java', 'com', 'evengirl', 'app', 'security', 'ObfuscatedConstants.kt'), buildKotlin(spec.constants)],
];

let drift = false;
for (const [path, content] of outputs) {
  if (CHECK_ONLY) {
    let current = '';
    try {
      current = readFileSync(path, 'utf8');
    } catch {
      /* dosya yok — drift sayılır */
    }
    if (current !== content) {
      console.error(`[gen:obf] Güncel değil: ${path}`);
      drift = true;
    }
    continue;
  }
  writeFileSync(path, content, 'utf8');
  console.log(`[gen:obf] Yazıldı: ${path}`);
}

if (drift) {
  console.error('[gen:obf] `npm run gen:obf` çalıştırıp sonucu commit edin.');
  process.exit(1);
}
