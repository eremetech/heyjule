import * as AuthSession from "expo-auth-session";
import * as WebBrowser from "expo-web-browser";
import {
  createContext,
  type PropsWithChildren,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { appConfig, patientScopes } from "../lib/app-config";
import { readStoredToken, writeStoredToken } from "./token-store";

WebBrowser.maybeCompleteAuthSession();

type AuthValue = {
  configured: boolean;
  loading: boolean;
  signedIn: boolean;
  error: string | null;
  signIn: () => Promise<void>;
  signOut: () => Promise<void>;
  getAccessToken: (forceRefresh?: boolean) => Promise<string | null>;
};

const AuthContext = createContext<AuthValue | null>(null);
const redirectUri = AuthSession.makeRedirectUri({ scheme: "heyjule", path: "oauth/callback" });

export function AuthProvider({ children }: PropsWithChildren) {
  const discovery = AuthSession.useAutoDiscovery(appConfig.oauthIssuer);
  const [request, response, promptAsync] = AuthSession.useAuthRequest(
    {
      clientId: appConfig.oauthClientId ?? "unconfigured",
      redirectUri,
      scopes: patientScopes,
      responseType: AuthSession.ResponseType.Code,
      usePKCE: true,
      extraParams: appConfig.apiUrl ? { resource: appConfig.apiUrl } : undefined,
    },
    discovery,
  );
  const tokenRef = useRef<AuthSession.TokenResponse | null>(null);
  const refreshRef = useRef<Promise<string | null> | null>(null);
  const [loading, setLoading] = useState(appConfig.oauthConfigured);
  const [signedIn, setSignedIn] = useState(Boolean(appConfig.devAccessToken));
  const [error, setError] = useState<string | null>(null);

  const persistToken = useCallback(async (token: AuthSession.TokenResponse | null) => {
    tokenRef.current = token;
    setSignedIn(Boolean(token) || Boolean(appConfig.devAccessToken));
    await writeStoredToken(token?.getRequestConfig() ?? null);
  }, []);

  useEffect(() => {
    if (!appConfig.oauthConfigured || appConfig.devAccessToken) {
      setLoading(false);
      return;
    }
    readStoredToken()
      .then((stored) => {
        if (stored) {
          tokenRef.current = new AuthSession.TokenResponse(stored);
          setSignedIn(true);
        }
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (response?.type === "error") {
      setError("Sign-in was not completed. Please try again.");
      return;
    }
    if (response?.type !== "success" || !request?.codeVerifier || !discovery) return;
    const code = response.params.code;
    if (!code) {
      setError("The sign-in response did not include an authorization code.");
      return;
    }
    setLoading(true);
    setError(null);
    AuthSession.exchangeCodeAsync(
      {
        clientId: appConfig.oauthClientId ?? "",
        code,
        redirectUri,
        extraParams: {
          code_verifier: request.codeVerifier,
          ...(appConfig.apiUrl ? { resource: appConfig.apiUrl } : {}),
        },
      },
      discovery,
    )
      .then(persistToken)
      .catch(() => setError("HeyJule could not finish signing in. Please try again."))
      .finally(() => setLoading(false));
  }, [discovery, persistToken, request, response]);

  const signIn = useCallback(async () => {
    if (appConfig.devAccessToken) {
      setSignedIn(true);
      return;
    }
    if (!appConfig.oauthConfigured || !request || !discovery) {
      setError("Secure sign-in is not configured yet.");
      return;
    }
    setError(null);
    await promptAsync();
  }, [discovery, promptAsync, request]);

  const getAccessToken = useCallback(async (forceRefresh = false) => {
    if (appConfig.devAccessToken) return appConfig.devAccessToken;
    const current = tokenRef.current;
    if (!current) return null;
    if (!forceRefresh && AuthSession.TokenResponse.isTokenFresh(current, 60)) return current.accessToken;
    if (!current.refreshToken || !discovery || !appConfig.oauthClientId) {
      await persistToken(null);
      return null;
    }
    if (!refreshRef.current) {
      refreshRef.current = AuthSession.refreshAsync(
        {
          clientId: appConfig.oauthClientId,
          refreshToken: current.refreshToken,
          scopes: patientScopes,
          extraParams: appConfig.apiUrl ? { resource: appConfig.apiUrl } : undefined,
        },
        discovery,
      )
        .then(async (token) => {
          await persistToken(token);
          return token.accessToken;
        })
        .catch(async () => {
          await persistToken(null);
          return null;
        })
        .finally(() => {
          refreshRef.current = null;
        });
    }
    return refreshRef.current;
  }, [discovery, persistToken]);

  const signOut = useCallback(async () => {
    const current = tokenRef.current;
    await persistToken(null);
    if (current && discovery?.revocationEndpoint && appConfig.oauthClientId) {
      await AuthSession.revokeAsync(
        { clientId: appConfig.oauthClientId, token: current.refreshToken ?? current.accessToken },
        discovery,
      ).catch(() => false);
    }
  }, [discovery, persistToken]);

  const value = useMemo<AuthValue>(
    () => ({
      configured: appConfig.oauthConfigured || Boolean(appConfig.devAccessToken),
      loading,
      signedIn,
      error,
      signIn,
      signOut,
      getAccessToken,
    }),
    [error, getAccessToken, loading, signIn, signOut, signedIn],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const auth = useContext(AuthContext);
  if (!auth) throw new Error("useAuth must be used inside AuthProvider");
  return auth;
}
