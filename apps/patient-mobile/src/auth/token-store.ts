import type { TokenResponseConfig } from "expo-auth-session";
import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";

const TOKEN_KEY = "heyjule.oauth-tokens.v1";
let volatileWebToken: TokenResponseConfig | null = null;

export async function readStoredToken() {
  try {
    if (Platform.OS === "web") return volatileWebToken;
    const value = await SecureStore.getItemAsync(TOKEN_KEY);
    return value ? (JSON.parse(value) as TokenResponseConfig) : null;
  } catch {
    return null;
  }
}

export async function writeStoredToken(token: TokenResponseConfig | null) {
  if (Platform.OS === "web") {
    volatileWebToken = token;
    return;
  }
  if (!token) {
    await SecureStore.deleteItemAsync(TOKEN_KEY);
    return;
  }
  await SecureStore.setItemAsync(TOKEN_KEY, JSON.stringify(token), {
    keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
  });
}
