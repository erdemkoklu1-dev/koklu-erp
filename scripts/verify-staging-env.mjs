// Staging RLS environment safety check.
//
// Bu script yalnızca local ortam güvenlik kontrolü içindir.
// - Eksik env değerlerini raporlar.
// - Production gibi görünen değerleri (hint) yakalar.
// - Secret'ları ekrana YAZMAZ; yalnızca maskelenmiş özet gösterir.
//
// Yeni dependency eklenmez. `.env.local` dosyasını basitçe kendisi okur;
// dosya yoksa yalnızca process.env üzerinden çalışır.

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const required = [
  'NEXT_PUBLIC_SUPABASE_URL',
  'NEXT_PUBLIC_SUPABASE_ANON_KEY',
  'SUPABASE_SERVICE_ROLE_KEY',
];

const productionHints = [
  'koklu-erp',
  'hbcbpirbcpthftddzjau',
];

// .env.local dosyasını dependency olmadan oku (varsa).
function loadEnvLocal() {
  const env = {};
  try {
    const raw = readFileSync(resolve(process.cwd(), '.env.local'), 'utf8');
    for (const line of raw.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eq = trimmed.indexOf('=');
      if (eq === -1) continue;
      const key = trimmed.slice(0, eq).trim();
      let value = trimmed.slice(eq + 1).trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      env[key] = value;
    }
    return { env, found: true };
  } catch {
    return { env, found: false };
  }
}

const { env: fileEnv, found: envFileFound } = loadEnvLocal();

function getValue(key) {
  // process.env önceliklidir; yoksa .env.local'dan al.
  return process.env[key] ?? fileEnv[key];
}

let hasError = false;

console.log('Staging RLS environment safety check');
console.log('------------------------------------');

if (envFileFound) {
  console.log('.env.local bulundu ve okundu.');
} else {
  console.log('.env.local bulunamadi; yalnizca process.env kontrol ediliyor.');
}

for (const key of required) {
  const value = getValue(key);

  if (!value) {
    console.error(`MISSING: ${key}`);
    hasError = true;
    continue;
  }

  const masked =
    value.length > 12
      ? `${value.slice(0, 6)}...${value.slice(-4)}`
      : '***';

  console.log(`FOUND: ${key} = ${masked}`);

  if (key.includes('KEY')) {
    continue;
  }

  const lower = value.toLowerCase();
  for (const hint of productionHints) {
    if (lower.includes(hint.toLowerCase())) {
      console.error(
        `POSSIBLE PRODUCTION VALUE DETECTED in ${key}. Do not run staging RLS dry-run with this environment.`
      );
      hasError = true;
    }
  }
}

if (hasError) {
  console.error('Environment safety check FAILED.');
  process.exit(1);
}

console.log('Environment variables exist and no production hint was detected.');
console.log('Still manually verify Supabase project name before running SQL.');
