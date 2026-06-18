import { gcm } from '@noble/ciphers/aes.js';
import { bytesToUtf8, utf8ToBytes } from '@noble/ciphers/utils.js';
import * as Crypto from 'expo-crypto';
import * as SecureStore from 'expo-secure-store';

const ENCRYPTION_KEY_ALIAS = 'auth_storage_aes_key_v1';
const ENCRYPTED_PREFIX = 'enc:v1:';
const KEY_BYTES = 32;
const IV_BYTES = 12;

const SECURE_OPTIONS: SecureStore.SecureStoreOptions = {
  keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
};

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function base64ToBytes(value: string): Uint8Array {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

async function loadOrCreateRawKey(): Promise<Uint8Array> {
  const existing = await SecureStore.getItemAsync(ENCRYPTION_KEY_ALIAS, SECURE_OPTIONS);
  if (existing) {
    return base64ToBytes(existing);
  }

  const keyBytes = await Crypto.getRandomBytesAsync(KEY_BYTES);
  await SecureStore.setItemAsync(ENCRYPTION_KEY_ALIAS, bytesToBase64(keyBytes), SECURE_OPTIONS);
  return keyBytes;
}

export function isEncryptedAuthPayload(value: string): boolean {
  return value.startsWith(ENCRYPTED_PREFIX);
}

/** Шифрует строку AES-256-GCM; ключ — в SecureStore, IV — expo-crypto. */
export async function encryptAuthPayload(plaintext: string): Promise<string> {
  const keyBytes = await loadOrCreateRawKey();
  const iv = await Crypto.getRandomBytesAsync(IV_BYTES);
  const cipher = gcm(keyBytes, iv).encrypt(utf8ToBytes(plaintext));

  const combined = new Uint8Array(iv.length + cipher.length);
  combined.set(iv, 0);
  combined.set(cipher, iv.length);

  return `${ENCRYPTED_PREFIX}${bytesToBase64(combined)}`;
}

/** Расшифровывает payload; для legacy plaintext возвращает null. */
export async function decryptAuthPayload(stored: string): Promise<string | null> {
  if (!isEncryptedAuthPayload(stored)) {
    return null;
  }

  const combined = base64ToBytes(stored.slice(ENCRYPTED_PREFIX.length));
  if (combined.length <= IV_BYTES) {
    return null;
  }

  const keyBytes = await loadOrCreateRawKey();
  const iv = combined.slice(0, IV_BYTES);
  const cipher = combined.slice(IV_BYTES);

  try {
    const plain = gcm(keyBytes, iv).decrypt(cipher);
    return bytesToUtf8(plain);
  } catch {
    return null;
  }
}
