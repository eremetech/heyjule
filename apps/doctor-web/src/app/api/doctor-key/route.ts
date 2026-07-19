import { NextResponse } from "next/server";
import { heyJuleApi } from "@/lib/heyjule-api";
import { requireDoctor } from "@/lib/session";

const idPattern = /^[A-Za-z0-9_-]{3,128}$/u;
const publicKeyPattern = /^[A-Za-z0-9_-]{80,200}$/u;

export async function POST(request: Request) {
  await requireDoctor();
  const body = await request.json().catch(() => null) as {
    id?: unknown;
    publicKey?: unknown;
  } | null;
  if (
    typeof body?.id !== "string" ||
    !idPattern.test(body.id) ||
    typeof body.publicKey !== "string" ||
    !publicKeyPattern.test(body.publicKey)
  ) {
    return NextResponse.json({ error: "validation_failed" }, { status: 400 });
  }
  const key = await heyJuleApi.registerDoctorKey({ id: body.id, publicKey: body.publicKey });
  return NextResponse.json({
    id: key.id,
    fingerprint: key.fingerprint,
    createdAt: key.createdAt,
  });
}
