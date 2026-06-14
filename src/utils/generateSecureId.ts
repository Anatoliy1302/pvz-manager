import * as Crypto from 'expo-crypto';

/** Криптостойкий локальный ID (UUID v4-подобный). */
export function generateSecureId(prefix = ''): string {
  const bytes = Crypto.getRandomBytes(16);
  const hex = Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
  return prefix ? `${prefix}_${hex}` : hex;
}
