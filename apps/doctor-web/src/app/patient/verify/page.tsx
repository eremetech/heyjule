"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";

/**
 * Bridge between the sign-in email and the patient app. Mail clients only
 * allow https links, so the email lands here and this page hands the
 * still-unused verification token to the app via its heyjule:// scheme.
 * The token is consumed by the app calling /api/auth/magic-link/verify.
 */
function VerifyContent() {
  const token = useSearchParams().get("token");
  const appUrl = token ? `heyjule://auth/verify?token=${encodeURIComponent(token)}` : null;

  return (
    <main
      style={{
        minHeight: "100dvh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 16,
        padding: 24,
        fontFamily: "-apple-system, 'Segoe UI', sans-serif",
        textAlign: "center",
      }}
    >
      {appUrl ? (
        <>
          <h1 style={{ fontSize: 22, fontWeight: 600 }}>Almost there</h1>
          <p style={{ color: "#57534e", maxWidth: 320 }}>
            Tap the button below on your phone to finish signing in to HeyJule.
          </p>
          <a
            href={appUrl}
            style={{
              background: "#e5674f",
              color: "#fff",
              textDecoration: "none",
              padding: "14px 26px",
              borderRadius: 14,
              fontWeight: 600,
            }}
          >
            Open HeyJule
          </a>
          <p style={{ color: "#a8a29e", fontSize: 13, maxWidth: 320 }}>
            Nothing happening? Make sure the HeyJule app is installed on this device.
          </p>
        </>
      ) : (
        <p style={{ color: "#57534e" }}>This sign-in link is incomplete. Request a new one from the app.</p>
      )}
    </main>
  );
}

export default function PatientVerifyPage() {
  return (
    <Suspense fallback={null}>
      <VerifyContent />
    </Suspense>
  );
}
