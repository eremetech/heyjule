const resendApiKey = process.env.RESEND_API_KEY?.trim();
const fromAddress = process.env.HEYJULE_MAIL_FROM?.trim() || "HeyJule <login@jules.agenticsonar.com>";

async function deliver(email: string, subject: string, html: string) {
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${resendApiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ from: fromAddress, to: [email], subject, html }),
  });
  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(`Resend rejected the sign-in email (${response.status}): ${detail.slice(0, 300)}`);
  }
}

/**
 * Sends the patient sign-in link via Resend. Without RESEND_API_KEY the link is
 * logged to the server console instead, so local development works end to end.
 */
export async function sendMagicLinkEmail(email: string, verifyUrl: string) {
  if (!resendApiKey) {
    console.warn(`[magic-link] RESEND_API_KEY not set — sign-in link for ${email}: ${verifyUrl}`);
    return;
  }
  await deliver(
    email,
    "Your HeyJule sign-in link",
    [
      `<div style="font-family:-apple-system,'Segoe UI',sans-serif;max-width:420px;margin:0 auto;padding:24px 16px;color:#1c1917">`,
      `<h2 style="font-weight:600">Sign in to HeyJule</h2>`,
      `<p>Tap the button below on your phone to open the HeyJule app and finish signing in. The link works once and expires in 5 minutes.</p>`,
      `<p style="margin:28px 0"><a href="${verifyUrl}" style="background:#e5674f;color:#fff;text-decoration:none;padding:14px 22px;border-radius:12px;font-weight:600">Open HeyJule</a></p>`,
      `<p style="color:#78716c;font-size:13px">If you didn't request this, you can ignore this email.</p>`,
      `</div>`,
    ].join(""),
  );
}

/**
 * Sends the 6-digit sign-in code via Resend. Without RESEND_API_KEY the code is
 * logged to the server console instead, so local development works end to end.
 */
export async function sendOtpEmail(email: string, otp: string) {
  if (!resendApiKey) {
    console.warn(`[email-otp] RESEND_API_KEY not set — sign-in code for ${email}: ${otp}`);
    return;
  }
  await deliver(
    email,
    `${otp} is your HeyJule sign-in code`,
    [
      `<div style="font-family:-apple-system,'Segoe UI',sans-serif;max-width:420px;margin:0 auto;padding:24px 16px;color:#1c1917">`,
      `<h2 style="font-weight:600">Sign in to HeyJule</h2>`,
      `<p>Enter this code in the HeyJule app. It works once and expires in 5 minutes.</p>`,
      `<p style="margin:28px 0;font-size:34px;font-weight:700;letter-spacing:0.3em;color:#e5674f">${otp}</p>`,
      `<p style="color:#78716c;font-size:13px">If you didn't request this, you can ignore this email.</p>`,
      `</div>`,
    ].join(""),
  );
}
