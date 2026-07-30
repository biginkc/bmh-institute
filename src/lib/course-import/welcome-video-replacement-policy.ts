export function assertWelcomeVideoReplacementNotRolledBack(
  rollbackRecords: readonly unknown[],
) {
  if (rollbackRecords.length > 0) {
    throw new Error(
      "Production welcome replacement was previously rolled back and is terminal; refusing retry before upload.",
    );
  }
}

export async function runWelcomeVideoUploadAfterRollbackGuard<T>({
  assertNotRolledBack,
  upload,
}: {
  assertNotRolledBack: () => Promise<void>;
  upload: () => Promise<T>;
}): Promise<T> {
  await assertNotRolledBack();
  return upload();
}
