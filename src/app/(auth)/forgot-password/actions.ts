"use server";

export type ForgotPasswordState =
  | { ok: false; error: string }
  | null;

export async function sendPasswordReset(
  _previousState?: unknown,
  _formData?: FormData,
): Promise<ForgotPasswordState> {
  void _previousState;
  void _formData;
  return {
    ok: false,
    error: "Institute password recovery is disabled. Recover your Hugo account instead.",
  };
}
