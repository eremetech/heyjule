"use server";

import { revalidatePath } from "next/cache";
import { requireDoctor } from "@/lib/session";
import { heyJuleApi } from "@/lib/heyjule-api";

export async function generateInviteCode() {
  await requireDoctor();
  await heyJuleApi.createInvite();
  revalidatePath("/");
}

export async function revokeInviteCode(formData: FormData) {
  await requireDoctor();
  const inviteId = formData.get("inviteId");
  if (typeof inviteId === "string") await heyJuleApi.revokeInvite(inviteId);
  revalidatePath("/");
}
