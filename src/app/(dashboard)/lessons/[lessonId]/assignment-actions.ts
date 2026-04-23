"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";

export type SubmitResult =
  | { ok: true }
  | { ok: false; error: string };

export async function submitAssignment(input: {
  assignmentId: string;
  lessonId: string;
  submission_type: "text" | "url" | "file_upload";
  submission_text?: string;
  submission_url?: string;
  submission_file_path?: string;
}): Promise<SubmitResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "You must be signed in." };

  if (input.submission_type === "text") {
    const text = (input.submission_text ?? "").trim();
    if (!text) return { ok: false, error: "Write your response before submitting." };
  } else if (input.submission_type === "url") {
    const url = (input.submission_url ?? "").trim();
    if (!url || !/^https?:\/\//i.test(url)) {
      return { ok: false, error: "Enter a valid http(s) URL." };
    }
  } else if (input.submission_type === "file_upload") {
    if (!input.submission_file_path) {
      return { ok: false, error: "Upload a file before submitting." };
    }
  }

  const { error } = await supabase.from("assignment_submissions").insert({
    assignment_id: input.assignmentId,
    lesson_id: input.lessonId,
    user_id: user.id,
    submission_text:
      input.submission_type === "text"
        ? (input.submission_text ?? "").trim()
        : null,
    submission_url:
      input.submission_type === "url"
        ? (input.submission_url ?? "").trim()
        : null,
    submission_file_path:
      input.submission_type === "file_upload"
        ? (input.submission_file_path ?? null)
        : null,
    status: "submitted",
  });
  if (error) return { ok: false, error: error.message };

  revalidatePath(`/lessons/${input.lessonId}`);
  revalidatePath(`/dashboard`);
  revalidatePath(`/admin/submissions`);
  return { ok: true };
}
