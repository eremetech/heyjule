"use client";

import {
  bytesToBase64Url,
  generateEncryptionKeyPair,
  publicKeyFromPrivateKey,
} from "@heyjule/crypto";

const DATABASE_NAME = "heyjule-doctor-keys";
const STORE_NAME = "records";
const CURRENT_KEY = "current-key";

export type BrowserDoctorKey = {
  id: string;
  privateKey: string;
  publicKey: string;
  createdAt: string;
};

type CurrentKeyRecord = { id: typeof CURRENT_KEY; keyId: string };

function openDatabase() {
  if (typeof indexedDB === "undefined") throw new Error("IndexedDB is unavailable");
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE_NAME)) {
        request.result.createObjectStore(STORE_NAME, { keyPath: "id" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Could not open doctor key store"));
  });
}

async function readRecord<T>(id: string) {
  const database = await openDatabase();
  try {
    return await new Promise<T | undefined>((resolve, reject) => {
      const request = database.transaction(STORE_NAME, "readonly").objectStore(STORE_NAME).get(id);
      request.onsuccess = () => resolve(request.result as T | undefined);
      request.onerror = () => reject(request.error ?? new Error("Could not read doctor key"));
    });
  } finally {
    database.close();
  }
}

async function writeCurrentKey(key: BrowserDoctorKey) {
  const database = await openDatabase();
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction(STORE_NAME, "readwrite");
      const store = transaction.objectStore(STORE_NAME);
      store.put(key);
      store.put({ id: CURRENT_KEY, keyId: key.id } satisfies CurrentKeyRecord);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error ?? new Error("Could not store doctor key"));
      transaction.onabort = () => reject(transaction.error ?? new Error("Doctor key storage aborted"));
    });
  } finally {
    database.close();
  }
}

function secureRandomBytes(length: number) {
  return crypto.getRandomValues(new Uint8Array(length));
}

export async function getOrCreateBrowserDoctorKey(): Promise<BrowserDoctorKey> {
  const current = await readRecord<CurrentKeyRecord>(CURRENT_KEY);
  if (current) {
    const stored = await readRecord<BrowserDoctorKey>(current.keyId);
    if (stored && publicKeyFromPrivateKey(stored.privateKey) === stored.publicKey) return stored;
  }

  const keyPair = generateEncryptionKeyPair(secureRandomBytes);
  const key: BrowserDoctorKey = {
    id: `doctor_key_${bytesToBase64Url(secureRandomBytes(18))}`,
    privateKey: keyPair.privateKey,
    publicKey: keyPair.publicKey,
    createdAt: new Date().toISOString(),
  };
  await writeCurrentKey(key);
  return key;
}

export async function getBrowserDoctorKey(keyId: string) {
  return readRecord<BrowserDoctorKey>(keyId);
}
