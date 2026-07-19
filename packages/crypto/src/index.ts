import { gcm } from "@noble/ciphers/aes.js";
import { p256 } from "@noble/curves/nist.js";
import { hkdf } from "@noble/hashes/hkdf.js";
import { sha256 } from "@noble/hashes/sha2.js";
import {
  SEALED_ENVELOPE_ALGORITHM,
  type SealedEnvelope,
} from "@heyjule/shared-types";

const encoder = new TextEncoder();
const decoder = new TextDecoder("utf-8", { fatal: true });
const BASE64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

export function bytesToBase64Url(bytes: Uint8Array) {
  let output = "";
  for (let index = 0; index < bytes.length; index += 3) {
    const a = bytes[index] ?? 0;
    const b = bytes[index + 1] ?? 0;
    const c = bytes[index + 2] ?? 0;
    const triple = (a << 16) | (b << 8) | c;
    output += BASE64[(triple >>> 18) & 63];
    output += BASE64[(triple >>> 12) & 63];
    output += index + 1 < bytes.length ? BASE64[(triple >>> 6) & 63] : "=";
    output += index + 2 < bytes.length ? BASE64[triple & 63] : "=";
  }
  return output.replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/u, "");
}

export function base64UrlToBytes(value: string) {
  if (!/^[A-Za-z0-9_-]*$/u.test(value)) throw new Error("Invalid base64url value");
  const normalized = value.replaceAll("-", "+").replaceAll("_", "/");
  const padded = normalized + "=".repeat((4 - (normalized.length % 4)) % 4);
  const bytes: number[] = [];
  for (let index = 0; index < padded.length; index += 4) {
    const chars = padded.slice(index, index + 4);
    const values = [...chars].map((char) => (char === "=" ? 0 : BASE64.indexOf(char)));
    if (values.some((item) => item < 0)) throw new Error("Invalid base64url value");
    const triple = ((values[0] ?? 0) << 18) | ((values[1] ?? 0) << 12) |
      ((values[2] ?? 0) << 6) | (values[3] ?? 0);
    bytes.push((triple >>> 16) & 255);
    if (chars[2] !== "=") bytes.push((triple >>> 8) & 255);
    if (chars[3] !== "=") bytes.push(triple & 255);
  }
  return Uint8Array.from(bytes);
}

export type EncryptionKeyPair = {
  privateKey: string;
  publicKey: string;
};

export type RandomBytes = (length: number) => Uint8Array;

export function generateEncryptionKeyPair(randomBytes: RandomBytes): EncryptionKeyPair {
  for (let attempt = 0; attempt < 128; attempt++) {
    const secret = randomBytes(32);
    if (!p256.utils.isValidSecretKey(secret)) continue;
    return {
      privateKey: bytesToBase64Url(secret),
      publicKey: bytesToBase64Url(p256.getPublicKey(secret, false)),
    };
  }
  throw new Error("Unable to generate a valid P-256 private key");
}

export function publicKeyFromPrivateKey(privateKey: string) {
  return bytesToBase64Url(p256.getPublicKey(base64UrlToBytes(privateKey), false));
}

export function assertValidPublicKey(publicKey: string) {
  const bytes = base64UrlToBytes(publicKey);
  p256.Point.fromBytes(bytes);
  if (bytes.length !== 65 || bytes[0] !== 4) {
    throw new Error("P-256 public key must use uncompressed SEC1 encoding");
  }
}

function deriveKey(privateKey: Uint8Array, publicKey: Uint8Array, salt: Uint8Array) {
  const sharedPoint = p256.getSharedSecret(privateKey, publicKey, false);
  // SEC1 uncompressed point = 0x04 || X || Y. ECDH uses the X coordinate.
  const sharedSecret = sharedPoint.slice(1, 33);
  return hkdf(sha256, sharedSecret, salt, encoder.encode("heyjule-sealed-envelope-v1"), 32);
}

export function sealJson(
  payload: unknown,
  recipientPublicKey: string,
  context: string,
  randomBytes: RandomBytes,
): SealedEnvelope {
  const recipient = base64UrlToBytes(recipientPublicKey);
  // Parsing validates that the key is a point on P-256 before ECDH.
  assertValidPublicKey(recipientPublicKey);
  const ephemeral = generateEncryptionKeyPair(randomBytes);
  const salt = randomBytes(16);
  const nonce = randomBytes(12);
  const key = deriveKey(base64UrlToBytes(ephemeral.privateKey), recipient, salt);
  const plaintext = encoder.encode(JSON.stringify(payload));
  const ciphertext = gcm(key, nonce, encoder.encode(context)).encrypt(plaintext);
  return {
    version: 1,
    algorithm: SEALED_ENVELOPE_ALGORITHM,
    ephemeralPublicKey: ephemeral.publicKey,
    salt: bytesToBase64Url(salt),
    nonce: bytesToBase64Url(nonce),
    ciphertext: bytesToBase64Url(ciphertext),
    context,
  };
}

export function openJson<T>(
  envelope: SealedEnvelope,
  recipientPrivateKey: string,
  expectedContext: string,
): T {
  if (envelope.version !== 1 || envelope.algorithm !== SEALED_ENVELOPE_ALGORITHM) {
    throw new Error("Unsupported sealed envelope");
  }
  if (envelope.context !== expectedContext) throw new Error("Envelope context mismatch");
  const privateKey = base64UrlToBytes(recipientPrivateKey);
  const ephemeralPublicKey = base64UrlToBytes(envelope.ephemeralPublicKey);
  assertValidPublicKey(envelope.ephemeralPublicKey);
  const key = deriveKey(privateKey, ephemeralPublicKey, base64UrlToBytes(envelope.salt));
  const plaintext = gcm(
    key,
    base64UrlToBytes(envelope.nonce),
    encoder.encode(envelope.context),
  ).decrypt(base64UrlToBytes(envelope.ciphertext));
  return JSON.parse(decoder.decode(plaintext)) as T;
}

export function fingerprintPublicKey(publicKey: string) {
  const digest = sha256(base64UrlToBytes(publicKey));
  return bytesToBase64Url(digest).slice(0, 22);
}

export function inboxEnvelopeContext(entryId: string, deviceId: string) {
  return `heyjule:inbox:v1:${entryId}:${deviceId}`;
}

export function doctorExportEnvelopeContext(exportId: string, doctorKeyId: string) {
  return `heyjule:doctor-export:v1:${exportId}:${doctorKeyId}`;
}
