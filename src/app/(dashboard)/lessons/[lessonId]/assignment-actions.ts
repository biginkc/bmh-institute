"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";
import { sendEmail } from "@/lib/email/send";
import { renderNewSubmissionEmail } from "@/lib/email/new-submission";

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

  const normalizedText =
    input.submission_type === "text"
      ? (input.submission_text ?? "").trim()
      : null;
  const normalizedUrl =
    input.submission_type === "url"
      ? (input.submission_url ?? "").trim()
      : null;
  const normalizedFilePath =
    input.submission_type === "file_upload"
      ? (input.submission_file_path ?? null)
      : null;

  const { error } = await supabase.from("assignment_submissions").insert({
    assignment_id: input.assignmentId,
    lesson_id: input.lessonId,
    user_id: user.id,
    submission_text: normalizedText,
    submission_url: normalizedUrl,
    submission_file_path: normalizedFilePath,
    status: "submitted",
  });
  if (error) return { ok: false, error: error.message };

  // Notify admins that there's work to review. Fire-and-forget so SMTP
  // hiccups don't roll back the submission.
  await notifyAdminsOfNewSubmission({
    supabase,
    learnerId: user.id,
    assignmentId: input.assignmentId,
    lessonId: input.lessonId,
    kind:
      input.submission_type === "text"
        ? "text"
        : input.submission_type === "url"
          ? "url"
          : "file",
    preview:
      input.submission_type === "text"
        ? (normalizedText ?? "")
        : input.submission_type === "url"
          ? (normalizedUrl ?? "")
          : filenameFromPath(normalizedFilePath),
  });

  revalidatePath(`/lessons/${input.lessonId}`);
  revalidatePath(`/dashboard`);
  revalidatePath(`/admin/submissions`);
  return { ok: true };
}

async function notifyAdminsOfNewSubmission(input: {
  supabase: Awaited<ReturnType<typeof createClient>>;
  learnerId: string;
  assignmentId: string;
  lessonId: string;
  kind: "text" | "url" | "file";
  preview: string;
}): Promise<void> {
  const [learnerRes, assignmentRes, lessonRes, adminsRes] = await Promise.all([
    input.supabase
      .from("profiles")
      .select("full_name, email")
      .eq("id", input.learnerId)
      .maybeSingle(),
    input.supabase
      .from("assignments")
      .select("title")
      .eq("id", input.assignmentId)
      .maybeSingle(),
    input.supabase
      .from("lessons")
      .select("title")
      .eq("id", input.lessonId)
      .maybeSingle(),
    input.supabase
      .from("profiles")
      .select("email, full_name")
      .in("system_role", ["owner", "admin"]),
  ]);

  const learner = learnerRes.data as
    | { full_name: string; email: string }
    | null;
  const assignment = assignmentRes.data as { title: string } | null;
  const lesson = lessonRes.data as { title: string } | null;
  const admins = (adminsRes.data ?? []) as Array<{
    email: string;
    full_name: string;
  }>;

  if (!learner || admins.length === 0) return;

  const appUrl =
    process.env.NEXT_PUBLIC_APP_URL ?? "https://sandra-university.vercel.app";
  const submissionsUrl = `${appUrl.replace(/\/$/, "")}/admin/submissions`;

  const rendered = renderNewSubmissionEmail({
    learnerName: learner.full_name || learner.email,
    learnerEmail: learner.email,
    assignmentTitle: assignment?.title ?? "Assignment",
    lessonTitle: lesson?.title ?? "Lesson",
    submissionKind: input.kind,
    submissionPreview: input.preview,
    submissionsUrl,
  });

  await Promise.all(
    admins.map((a) =>
      sendEmail({
        to: a.email,
        subject: rendered.subject,
        html: rendered.html,
      }),
    ),
  );
}

function filenameFromPath(p: string | null): string {
  if (!p) return "file";
  const last = p.split("/").pop() ?? "file";
  return last.replace(/^\d+-/, "");
}
