export const IMPORT_RELEASE_REQUIRED_ERROR =
  "Imported course content can only be published or granted to employees by the evidence-bound release operation.";

export const IMPORT_ROLLBACK_REQUIRED_ERROR =
  "Imported course content can only be deleted with the exact course-import rollback operation.";

export const IMPORT_QA_MEMBERSHIP_RESTRICTED_ERROR =
  "The private imported-course review group cannot be assigned through user or invite administration.";

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
  if (/unreleased imported catalog QA role group/i.test(message)) {
    return IMPORT_QA_MEMBERSHIP_RESTRICTED_ERROR;
  }
  if (/imported catalog graph deletion|course-import rollback/i.test(message)) {
    return IMPORT_ROLLBACK_REQUIRED_ERROR;
  }
  if (
    /imported catalog release|import release|evidence-bound release/i.test(
      message,
    )
  ) {
    return IMPORT_RELEASE_REQUIRED_ERROR;
  }

  return message;
}

export function importedDeletionError(contentImportId: string | null): string | null {
  return contentImportId ? IMPORT_ROLLBACK_REQUIRED_ERROR : null;
}
