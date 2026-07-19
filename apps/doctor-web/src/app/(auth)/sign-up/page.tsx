"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { signUp } from "@/lib/auth-client";

export default function SignUpPage() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const form = new FormData(e.currentTarget);
    const { error } = await signUp.email({
      name: String(form.get("name")),
      email: String(form.get("email")),
      password: String(form.get("password")),
    });
    if (error) {
      setError(error.message ?? "Sign-up failed.");
      setBusy(false);
      return;
    }
    router.push("/");
    router.refresh();
  }

  return (
    <div className="auth-card">
      <div>
        <h1>Create account</h1>
        <p className="auth-alt">For clinicians using HeyJule with their patients.</p>
      </div>
      <form onSubmit={onSubmit}>
        <div>
          <label htmlFor="name">Full name</label>
          <input id="name" name="name" autoComplete="name" required />
        </div>
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
            autoComplete="new-password"
            minLength={12}
            required
          />
        </div>
        {error && <p className="auth-error" role="alert">{error}</p>}
        <button type="submit" className="button-primary" disabled={busy}>
          {busy ? "Creating…" : "Create account"}
        </button>
      </form>
      <p className="auth-alt">
        Already registered? <Link href="/sign-in">Sign in</Link>
      </p>
    </div>
  );
}
