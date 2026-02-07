// Client-side encryption utilities.
// Uses PBKDF2 to derive an AES-GCM key from a password. Seeds are only stored encrypted.

const encoder = new TextEncoder();

function toBase64(uint8) {
  return btoa(String.fromCharCode(...uint8));
}

function fromBase64(str) {
  return Uint8Array.from(atob(str), (c) => c.charCodeAt(0));
}

async function deriveKey(password, salt) {
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    encoder.encode(password),
    { name: "PBKDF2" },
    false,
    ["deriveKey"]
  );
  return crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt,
      iterations: 100000,
      hash: "SHA-256",
    },
    keyMaterial,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
}

export async function encryptSeed(seed, password) {
  if (!password) throw new Error("Password required for encryption.");
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(password, salt);

  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    encoder.encode(seed)
  );

  return {
    cipher: toBase64(new Uint8Array(ciphertext)),
    salt: toBase64(salt),
    iv: toBase64(iv),
  };
}

export async function decryptSeed(payload, password) {
  if (!payload || !payload.cipher || !payload.salt || !payload.iv) {
    throw new Error("Missing encrypted payload.");
  }
  const salt = fromBase64(payload.salt);
  const iv = fromBase64(payload.iv);
  const key = await deriveKey(password, salt);

  const plainBuffer = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv },
    key,
    fromBase64(payload.cipher)
  );

  return new TextDecoder().decode(plainBuffer);
}
