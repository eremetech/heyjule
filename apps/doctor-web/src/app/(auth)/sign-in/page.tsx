"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { signIn } from "@/lib/auth-client";

export default function SignInPage() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const form = new FormData(e.currentTarget);
    const { error } = await signIn.email({
      email: String(form.get("email")),
      password: String(form.get("password")),
    });
    if (error) {
      setError(error.message ?? "Sign-in failed.");
      setBusy(false);
      return;
    }
    router.push("/");
    router.refresh();
  }

  return (
    <div className="auth-card">
      <div>
        <h1>HeyJule</h1>
        <p className="auth-alt">Sign in to view your patients&rsquo; briefs.</p>
      </div>
      <form onSubmit={onSubmit}>
        <div>
          <label htmlFor="email">Email</label>
          <input id="email" name="email" type="email" autoComplete="email" required />
        </div>
        <div>
          <label htmlFor="password">Password</label>
          <input
            id="password"
            name="password"
            type="password"
            autoComplete="current-password"
            required
          />
        </div>
        {error && <p className="auth-error" role="alert">{error}</p>}
        <button type="submit" className="button-primary" disabled={busy}>
          {busy ? "Signing in…" : "Sign in"}
        </button>
      </form>
      <p className="auth-alt">
        New here? <Link href="/sign-up">Create an account</Link>
      </p>
    </div>
  );
}
