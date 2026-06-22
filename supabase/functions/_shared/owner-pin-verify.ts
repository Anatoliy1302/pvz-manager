const PIN_ITERATIONS = 10_000;
const HASH_PREFIX = 'v1:';

async function derivePinHash(pin: string, saltHex: string): Promise<string> {
  let hash = `${saltHex}:${pin}`;
  const encoder = new TextEncoder();
  for (let i = 0; i < PIN_ITERATIONS; i++) {
    const digest = await crypto.subtle.digest('SHA-256', encoder.encode(hash));
    hash = Array.from(new Uint8Array(digest))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
  }
  return hash;
}

/** Совместимо с src/utils/pinHash.ts (v1:saltHex:hashHex). */
export async function verifyOwnerPin(pin: string, stored: string): Promise<boolean> {
  if (!stored || !pin) return false;
  if (!stored.startsWith(HASH_PREFIX)) {
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
