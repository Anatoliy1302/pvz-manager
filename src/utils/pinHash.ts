import * as Crypto from 'expo-crypto';

const PIN_ITERATIONS = 10_000;
const SALT_BYTES = 16;
const HASH_PREFIX = 'v1:';

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

async function derivePinHash(pin: string, saltHex: string): Promise<string> {
  let hash = `${saltHex}:${pin}`;
  for (let i = 0; i < PIN_ITERATIONS; i++) {
    hash = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, hash);
  }
  return hash;
}

export function isHashedPin(value: string): boolean {
  return value.startsWith(HASH_PREFIX);
}

/** Хеширует PIN с уникальной солью. Формат: v1:saltHex:hashHex */
export async function hashPin(pin: string): Promise<string> {
  const salt = Crypto.getRandomBytes(SALT_BYTES);
  const saltHex = bytesToHex(salt);
  const hash = await derivePinHash(pin, saltHex);
  return `${HASH_PREFIX}${saltHex}:${hash}`;
}

/** Проверяет PIN против сохранённого значения (хеш или legacy plaintext). */
export async function verifyPin(pin: string, stored: string): Promise<boolean> {
  if (!stored) return false;

  if (!isHashedPin(stored)) {
    // Legacy: plaintext PIN (до миграции)
    return stored === pin;
  }

  const payload = stored.slice(HASH_PREFIX.length);
  const colonIndex = payload.indexOf(':');
  if (colonIndex === -1) return false;

  const saltHex = payload.slice(0, colonIndex);
  const expectedHash = payload.slice(colonIndex + 1);
  const actualHash = await derivePinHash(pin, saltHex);

  return actualHash === expectedHash;
}

/** Если PIN в legacy-формате и верный — возвращает новый хеш для сохранения. */
export async function upgradePinIfLegacy(
  pin: string,
  stored: string
): Promise<string | null> {
  if (isHashedPin(stored)) return null;
  if (stored !== pin) return null;
  return hashPin(pin);
}
