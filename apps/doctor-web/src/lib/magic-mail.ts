const resendApiKey = process.env.RESEND_API_KEY?.trim();
const fromAddress = process.env.HEYJULE_MAIL_FROM?.trim() || "HeyJule <login@jules.agenticsonar.com>";

/**
 * Sends the patient sign-in link via Resend. Without RESEND_API_KEY the link is
 * logged to the server console instead, so local development works end to end.
 */
export async function sendMagicLinkEmail(email: string, verifyUrl: string) {
  if (!resendApiKey) {
    console.warn(`[magic-link] RESEND_API_KEY not set — sign-in link for ${email}: ${verifyUrl}`);
    return;
  }
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${resendApiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: fromAddress,
      to: [email],
      subject: "Your HeyJule sign-in link",
      html: [
        `<div style="font-family:-apple-system,'Segoe UI',sans-serif;max-width:420px;margin:0 auto;padding:24px 16px;color:#1c1917">`,
        `<h2 style="font-weight:600">Sign in to HeyJule</h2>`,
        `<p>Tap the button below on your phone to open the HeyJule app and finish signing in. The link works once and expires in 5 minutes.</p>`,
        `<p style="margin:28px 0"><a href="${verifyUrl}" style="background:#e5674f;color:#fff;text-decoration:none;padding:14px 22px;border-radius:12px;font-weight:600">Open HeyJule</a></p>`,
        `<p style="color:#78716c;font-size:13px">If you didn't request this, you can ignore this email.</p>`,
        `</div>`,
      ].join(""),
    }),
  });
  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(`Resend rejected the sign-in email (${response.status}): ${detail.slice(0, 300)}`);
  }
}
