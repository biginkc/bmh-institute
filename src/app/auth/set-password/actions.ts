"use server";

export type SetPasswordState =
  | { ok: false; error: string }
  | null;

export async function setPassword(
  _previousState?: unknown,
  _formData?: FormData,
): Promise<SetPasswordState> {
  void _previousState;
  void _formData;
  return {
    ok: false,
    error: "Institute passwords are disabled. Change your Hugo password instead.",
  };
}
