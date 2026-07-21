"use server";

export type LoginResult = { ok: false; error: string };

export async function signIn(
  _previousState?: unknown,
  _formData?: FormData,
): Promise<LoginResult> {
  void _previousState;
  void _formData;
  return {
    ok: false,
    error: "Institute passwords are disabled. Continue with Hugo.",
  };
}
