import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

export type EncryptedAtRest = {
  ciphertext: string;
  nonce: string;
  tag: string;
};

export function encryptAtRest(value: unknown, key: Uint8Array, aad: string): EncryptedAtRest {
  const nonce = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, nonce);
  cipher.setAAD(Buffer.from(aad, "utf8"));
  const ciphertext = Buffer.concat([
    cipher.update(JSON.stringify(value), "utf8"),
    cipher.final(),
  ]);
  return {
    ciphertext: ciphertext.toString("base64url"),
    nonce: nonce.toString("base64url"),
    tag: cipher.getAuthTag().toString("base64url"),
  };
}

export function decryptAtRest<T>(value: EncryptedAtRest, key: Uint8Array, aad: string): T {
  const decipher = createDecipheriv(
    "aes-256-gcm",
    key,
    Buffer.from(value.nonce, "base64url"),
  );
  decipher.setAAD(Buffer.from(aad, "utf8"));
  decipher.setAuthTag(Buffer.from(value.tag, "base64url"));
  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(value.ciphertext, "base64url")),
    decipher.final(),
  ]);
  return JSON.parse(plaintext.toString("utf8")) as T;
}
