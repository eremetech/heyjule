import { bytesToBase64Url, generateEncryptionKeyPair, publicKeyFromPrivateKey } from "@heyjule/crypto";
import * as Crypto from "expo-crypto";
import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";

const DEVICE_ID_KEY = "heyjule.device-id.v1";
const DEVICE_PRIVATE_KEY = "heyjule.device-private-key.v1";
const secureOptions = { keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY } as const;

export type DeviceIdentity = {
  deviceId: string;
  privateKey: string;
  publicKey: string;
};

export async function getOrCreateDeviceIdentity(): Promise<DeviceIdentity | null> {
  // The web build has no durable hardware-backed place for this private key.
  if (Platform.OS === "web") return null;

  const [storedId, storedPrivateKey] = await Promise.all([
    SecureStore.getItemAsync(DEVICE_ID_KEY),
    SecureStore.getItemAsync(DEVICE_PRIVATE_KEY),
  ]);
  const deviceId = storedId ?? `device_${bytesToBase64Url(await Crypto.getRandomBytesAsync(18))}`;

  if (storedPrivateKey) {
    if (!storedId) await SecureStore.setItemAsync(DEVICE_ID_KEY, deviceId, secureOptions);
    return {
      deviceId,
      privateKey: storedPrivateKey,
      publicKey: publicKeyFromPrivateKey(storedPrivateKey),
    };
  }

  let keyPair: ReturnType<typeof generateEncryptionKeyPair> | null = null;
  while (!keyPair) {
    const candidate = await Crypto.getRandomBytesAsync(32);
    try {
      keyPair = generateEncryptionKeyPair(() => candidate);
    } catch {
      // Invalid P-256 secret candidates are extraordinarily rare; generate another.
    }
  }
  await SecureStore.setItemAsync(DEVICE_PRIVATE_KEY, keyPair.privateKey, secureOptions);
  await SecureStore.setItemAsync(DEVICE_ID_KEY, deviceId, secureOptions);
  return { deviceId, privateKey: keyPair.privateKey, publicKey: keyPair.publicKey };
}
