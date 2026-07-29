/**
 * Production QA mail routing is opt-in and server-controlled. The user IDs
 * are exact identifiers, never a name/email prefix, so ordinary production
 * users cannot enter the QA path by choosing a display value.
 */
export function isQaFixtureUser(userId: string): boolean {
  const configured = process.env.INSTITUTE_QA_NOTIFICATION_USER_IDS ?? "";
  return configured
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean)
    .includes(userId);
}

export function routeQaNotification(
  userId: string,
  ordinaryRecipient: string,
): string | null {
  if (!isQaFixtureUser(userId)) return ordinaryRecipient;
  const qaRecipient = process.env.INSTITUTE_QA_NOTIFICATION_RECIPIENT?.trim();
  return qaRecipient || null;
}
