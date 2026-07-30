export function assertWelcomeVideoReplacementNotRolledBack(
  rollbackRecords: readonly unknown[],
) {
  if (rollbackRecords.length > 0) {
    throw new Error(
      "Production welcome replacement was previously rolled back and is terminal; refusing retry before upload.",
    );
  }
}
