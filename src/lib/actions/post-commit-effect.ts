import { after } from "next/server";

export function schedulePostCommitEffect(
  label: string,
  effect: () => Promise<unknown>,
): void {
  after(async () => {
    try {
      await effect();
    } catch {
      // The primary database mutation has already committed. Report the
      // secondary failure without leaking provider details or turning a
      // durable success into an indeterminate client response.
      console.error(`[post-commit-effect] ${label} failed`);
    }
  });
}
