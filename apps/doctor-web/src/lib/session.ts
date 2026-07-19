import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "./auth";

/* Server-side auth gate. Middleware only optimistically redirects; this is the
 * real check every protected page and action runs. */
export async function requireDoctor() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect("/sign-in");
  return session.user;
}
