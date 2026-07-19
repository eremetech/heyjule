"use server";

import { randomUUID, randomInt } from "node:crypto";
import { revalidatePath } from "next/cache";
import { requireDoctor } from "@/lib/session";
import { createInvite, revokeInvite } from "@/lib/db";

/* Unambiguous alphabet — no 0/O, 1/I. */
const ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";

export async function generateInviteCode() {
  const doctor = await requireDoctor();
  let code = "";
  for (let i = 0; i < 6; i++) code += ALPHABET[randomInt(ALPHABET.length)];
  createInvite(doctor.id, randomUUID(), code);
  revalidatePath("/");
}

export async function revokeInviteCode(formData: FormData) {
  const doctor = await requireDoctor();
  const inviteId = formData.get("inviteId");
  if (typeof inviteId === "string") revokeInvite(doctor.id, inviteId);
  revalidatePath("/");
}
