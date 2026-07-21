const PREAUTHENTICATED_STATE_ENV = "E2E_HUGO_STORAGE_STATE";

export const PREAUTHENTICATED_STATE_REQUIRED =
  "Authenticated production checks require a user-supplied Playwright storage-state file captured after a real Hugo login. Password bootstraps are forbidden; when no artifact is supplied, complete these checks manually in Chrome.";

export function hasPreauthenticatedState(): boolean {
  return Boolean(process.env[PREAUTHENTICATED_STATE_ENV]?.trim());
}
