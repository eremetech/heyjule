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
import { Linking } from "react-native";

import { appConfig } from "../lib/app-config";
import { readStoredSession, writeStoredSession } from "./token-store";

type AuthValue = {
  configured: boolean;
  loading: boolean;
  signedIn: boolean;
  /** A sign-in email has been sent and we're waiting for the link to be tapped. */
  awaitingLink: boolean;
  /** A sign-in code email has been sent and we're waiting for the code entry. */
  awaitingCode: boolean;
  error: string | null;
  signIn: (email: string) => Promise<void>;
  /** Emails a 6-digit sign-in code instead of a link (works without deep links). */
  requestCode: (email: string) => Promise<void>;
  signInWithCode: (email: string, code: string) => Promise<void>;
  signOut: () => Promise<void>;
  getAccessToken: (forceRefresh?: boolean) => Promise<string | null>;
};

const AuthContext = createContext<AuthValue | null>(null);

// Better Auth JWTs live for 10 minutes; refresh with margin.
const JWT_TTL_MS = 8 * 60 * 1000;

function extractMagicToken(url: string): string | null {
  if (!url.startsWith("heyjule://")) return null;
  const match = url.match(/[?&]token=([^&#]+)/u);
  if (!match?.[1] || !/auth\/verify/u.test(url)) return null;
  try {
    return decodeURIComponent(match[1]);
  } catch {
    return null;
  }
}

export function AuthProvider({ children }: PropsWithChildren) {
  const sessionRef = useRef<string | null>(null);
  const jwtRef = useRef<{ token: string; fetchedAt: number } | null>(null);
  const refreshRef = useRef<Promise<string | null> | null>(null);
  const consumedMagicTokens = useRef<Set<string>>(new Set());
  const [loading, setLoading] = useState(appConfig.authConfigured);
  const [signedIn, setSignedIn] = useState(Boolean(appConfig.devAccessToken));
  const [awaitingLink, setAwaitingLink] = useState(false);
  const [awaitingCode, setAwaitingCode] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const persistSession = useCallback(async (token: string | null) => {
    sessionRef.current = token;
    jwtRef.current = null;
    setSignedIn(Boolean(token) || Boolean(appConfig.devAccessToken));
    await writeStoredSession(token);
  }, []);

  const completeMagicSignIn = useCallback(
    async (magicToken: string) => {
      if (!appConfig.authUrl || consumedMagicTokens.current.has(magicToken)) return;
      consumedMagicTokens.current.add(magicToken);
      setLoading(true);
      setError(null);
      try {
        const response = await fetch(
          `${appConfig.authUrl}/api/auth/magic-link/verify?token=${encodeURIComponent(magicToken)}`,
          { headers: { Accept: "application/json" } },
        );
        if (!response.ok) throw new Error(`verify failed (${response.status})`);
        const body = (await response.json()) as { token?: string };
        if (!body.token) throw new Error("verify response had no session token");
        await persistSession(body.token);
        setAwaitingLink(false);
      } catch {
        setError("That sign-in link is no longer valid. Please request a new one.");
      } finally {
        setLoading(false);
      }
    },
    [persistSession],
  );

  useEffect(() => {
    if (!appConfig.authConfigured || appConfig.devAccessToken) {
      setLoading(false);
      return;
    }
    readStoredSession()
      .then((stored) => {
        if (stored) {
          sessionRef.current = stored;
          setSignedIn(true);
        }
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    const handleUrl = (url: string | null) => {
      const token = url ? extractMagicToken(url) : null;
      if (token) void completeMagicSignIn(token);
    };
    const subscription = Linking.addEventListener("url", ({ url }) => handleUrl(url));
    Linking.getInitialURL().then(handleUrl).catch(() => undefined);
    return () => subscription.remove();
  }, [completeMagicSignIn]);

  const signIn = useCallback(async (email: string) => {
    if (appConfig.devAccessToken) {
      setSignedIn(true);
      return;
    }
    if (!appConfig.authConfigured || !appConfig.authUrl) {
      setError("Secure sign-in is not configured yet.");
      return;
    }
    const address = email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(address)) {
      setError("Enter a valid email address.");
      return;
    }
    setError(null);
    setLoading(true);
    try {
      const response = await fetch(`${appConfig.authUrl}/api/auth/sign-in/magic-link`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: address }),
      });
      if (!response.ok) throw new Error(`magic link request failed (${response.status})`);
      setAwaitingLink(true);
    } catch {
      setError("HeyJule could not send the sign-in email. Please try again.");
    } finally {
      setLoading(false);
    }
  }, []);

  const requestCode = useCallback(async (email: string) => {
    if (appConfig.devAccessToken) {
      setSignedIn(true);
      return;
    }
    if (!appConfig.authConfigured || !appConfig.authUrl) {
      setError("Secure sign-in is not configured yet.");
      return;
    }
    const address = email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(address)) {
      setError("Enter a valid email address.");
      return;
    }
    setError(null);
    setLoading(true);
    try {
      const response = await fetch(`${appConfig.authUrl}/api/auth/email-otp/send-verification-otp`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: address, type: "sign-in" }),
      });
      if (!response.ok) throw new Error(`code request failed (${response.status})`);
      setAwaitingCode(true);
    } catch {
      setError("HeyJule could not send the sign-in code. Please try again.");
    } finally {
      setLoading(false);
    }
  }, []);

  const signInWithCode = useCallback(
    async (email: string, code: string) => {
      if (!appConfig.authUrl) return;
      const address = email.trim().toLowerCase();
      const otp = code.replace(/\D/gu, "");
      if (otp.length < 6) {
        setError("Enter the 6-digit code from the email.");
        return;
      }
      setError(null);
      setLoading(true);
      try {
        const response = await fetch(`${appConfig.authUrl}/api/auth/sign-in/email-otp`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email: address, otp }),
        });
        if (!response.ok) throw new Error(`code sign-in failed (${response.status})`);
        const body = (await response.json()) as { token?: string };
        if (!body.token) throw new Error("sign-in response had no session token");
        await persistSession(body.token);
        setAwaitingCode(false);
        setAwaitingLink(false);
      } catch {
        setError("That code didn't work. Check the digits or request a new one.");
      } finally {
        setLoading(false);
      }
    },
    [persistSession],
  );

  const getAccessToken = useCallback(
    async (forceRefresh = false) => {
      if (appConfig.devAccessToken) return appConfig.devAccessToken;
      const session = sessionRef.current;
      if (!session || !appConfig.authUrl) return null;
      const cached = jwtRef.current;
      if (!forceRefresh && cached && Date.now() - cached.fetchedAt < JWT_TTL_MS) return cached.token;
      if (!refreshRef.current) {
        refreshRef.current = fetch(`${appConfig.authUrl}/api/auth/token`, {
          headers: { Authorization: `Bearer ${session}` },
        })
          .then(async (response) => {
            if (response.status === 401 || response.status === 403) {
              await persistSession(null);
              return null;
            }
            if (!response.ok) return null;
            const body = (await response.json()) as { token?: string };
            if (!body.token) return null;
            jwtRef.current = { token: body.token, fetchedAt: Date.now() };
            return body.token;
          })
          .catch(() => null)
          .finally(() => {
            refreshRef.current = null;
          });
      }
      return refreshRef.current;
    },
    [persistSession],
  );

  const signOut = useCallback(async () => {
    const session = sessionRef.current;
    await persistSession(null);
    setAwaitingLink(false);
    setAwaitingCode(false);
    if (session && appConfig.authUrl) {
      await fetch(`${appConfig.authUrl}/api/auth/sign-out`, {
        method: "POST",
        headers: { Authorization: `Bearer ${session}` },
      }).catch(() => undefined);
    }
  }, [persistSession]);

  const value = useMemo<AuthValue>(
    () => ({
      configured: appConfig.authConfigured || Boolean(appConfig.devAccessToken),
      loading,
      signedIn,
      awaitingLink,
      awaitingCode,
      error,
      signIn,
      requestCode,
      signInWithCode,
      signOut,
      getAccessToken,
    }),
    [awaitingCode, awaitingLink, error, getAccessToken, loading, requestCode, signIn, signInWithCode, signOut, signedIn],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const auth = useContext(AuthContext);
  if (!auth) throw new Error("useAuth must be used inside AuthProvider");
  return auth;
}
