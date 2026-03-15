interface CryptoLike {
  randomUUID?: () => string;
  getRandomValues?: (bytes: Uint8Array) => Uint8Array;
}

function getCryptoLike(): CryptoLike | undefined {
  return typeof globalThis === 'object'
    ? (globalThis as { crypto?: CryptoLike }).crypto
    : undefined;
}

function fillRandomBytes(bytes: Uint8Array): Uint8Array {
  const crypto = getCryptoLike();
  if (crypto?.getRandomValues) {
    return crypto.getRandomValues(bytes);
  }

  for (let index = 0; index < bytes.length; index += 1) {
    bytes[index] = Math.floor(Math.random() * 256);
  }

  return bytes;
}

function fallbackRandomUuid(): string {
  const bytes = fillRandomBytes(new Uint8Array(16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = [...bytes].map((value) => value.toString(16).padStart(2, '0')).join('');

  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20)
  ].join('-');
}

export function createRandomUuid(): string {
  const crypto = getCryptoLike();
  if (crypto?.randomUUID) {
    return crypto.randomUUID();
  }

  return fallbackRandomUuid();
}
