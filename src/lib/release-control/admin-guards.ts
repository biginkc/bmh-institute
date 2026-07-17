export const IMPORT_RELEASE_REQUIRED_ERROR =
  "Imported course content can only be published or granted to employees by the evidence-bound release operation.";

export function importedPublicationError(input: {
  contentImportId: string | null;
  currentlyPublished: boolean;
  requestedPublished: boolean;
}): string | null {
  if (
    input.contentImportId &&
    !input.currentlyPublished &&
    input.requestedPublished
  ) {
    return IMPORT_RELEASE_REQUIRED_ERROR;
  }

  return null;
}

export function normalizeReleaseControlError(message: string): string {
  if (
    /imported catalog release|import release|evidence-bound release/i.test(
      message,
    )
  ) {
    return IMPORT_RELEASE_REQUIRED_ERROR;
  }

  return message;
}
