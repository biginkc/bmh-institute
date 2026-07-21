"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";

export type UpdateProfileState =
  | { ok: true }
  | { ok: false; error: string }
  | null;

export async function updateProfile(
  _prev: UpdateProfileState,
  formData: FormData,
): Promise<UpdateProfileState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Sign in first." };

  const fullName = String(formData.get("full_name") ?? "").trim();
  if (!fullName) return { ok: false, error: "Name is required." };
  if (fullName.length > 200) {
    return { ok: false, error: "Name must be at most 200 characters." };
  }

  const { error } = await supabase
    .from("profiles")
    .update({ full_name: fullName })
    .eq("id", user.id);
  if (error) return { ok: false, error: error.message };

  revalidatePath("/profile");
  revalidatePath("/dashboard");
  return { ok: true };
}

export async function changePassword(
  _prev: UpdateProfileState,
  _formData: FormData,
): Promise<UpdateProfileState> {
  void _prev;
  void _formData;
  return {
    ok: false,
    error: "Institute passwords are disabled. Change your Hugo password instead.",
  };
}
