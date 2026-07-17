"use server";

import { revalidatePath } from "next/cache";

import { requireAdmin } from "@/lib/auth/guard";
import { normalizeReleaseControlError } from "@/lib/release-control/admin-guards";
import { createClient } from "@/lib/supabase/server";

export type ActionResult =
  | { ok: true }
  | { ok: false; error: string };

export async function createRoleGroup(input: {
  name: string;
  description: string | null;
}): Promise<ActionResult> {
  await requireAdmin();
  const name = input.name.trim();
  if (!name) return { ok: false, error: "Name is required." };
  if (name.length > 200) {
    return { ok: false, error: "Name must be at most 200 characters." };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("role_groups")
    .insert({ name, description: input.description });
  if (error) return { ok: false, error: error.message };

  revalidatePath("/admin/role-groups");
  revalidatePath("/admin/users");
  return { ok: true };
}

export async function updateRoleGroup(input: {
  id: string;
  name: string;
  description: string | null;
}): Promise<ActionResult> {
  await requireAdmin();
  const name = input.name.trim();
  if (!name) return { ok: false, error: "Name is required." };

  const supabase = await createClient();
  const { error } = await supabase
    .from("role_groups")
    .update({ name, description: input.description })
    .eq("id", input.id);
  if (error) return { ok: false, error: error.message };

  revalidatePath("/admin/role-groups");
  revalidatePath("/admin/users");
  return { ok: true };
}

export async function deleteRoleGroup(id: string): Promise<ActionResult> {
  await requireAdmin();
  const supabase = await createClient();
  const { error } = await supabase.from("role_groups").delete().eq("id", id);
  if (error) {
    return { ok: false, error: normalizeReleaseControlError(error.message) };
  }

  revalidatePath("/admin/role-groups");
  revalidatePath("/admin/users");
  revalidatePath("/dashboard");
  return { ok: true };
}
