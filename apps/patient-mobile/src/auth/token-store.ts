import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";

const SESSION_KEY = "heyjule.session-token.v1";
let volatileWebToken: string | null = null;

export async function readStoredSession(): Promise<string | null> {
  try {
    if (Platform.OS === "web") return volatileWebToken;
    return await SecureStore.getItemAsync(SESSION_KEY);
  } catch {
    return null;
  }
}

export async function writeStoredSession(token: string | null) {
  if (Platform.OS === "web") {
    volatileWebToken = token;
    return;
  }
  if (!token) {
    await SecureStore.deleteItemAsync(SESSION_KEY);
    return;
  }
  await SecureStore.setItemAsync(SESSION_KEY, token, {
    keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
  });
}
