import { assertCanonicalSupabaseProjectUrl } from "../supabase/canonical-project-url";

const TEST_PROJECT_REF = "jvaabkchkihkjllehmft";
const PRODUCTION_PROJECT_REF = "dhvfsyteqsxagokoerrx";

export const COURSE_IMPORT_TEST_URL = `https://${TEST_PROJECT_REF}.supabase.co`;
export const COURSE_IMPORT_PRODUCTION_URL = `https://${PRODUCTION_PROJECT_REF}.supabase.co`;

export function assertCourseImportEnvironment(
  rawUrl: string,
  allowProduction: boolean,
): "test" | "production" {
  let projectRef: string;
  try {
    projectRef = assertCanonicalSupabaseProjectUrl(rawUrl, [
      TEST_PROJECT_REF,
      PRODUCTION_PROJECT_REF,
    ]);
  } catch {
    throw new Error("Course import writes require the canonical BMH Institute test or production Supabase project URL with no credentials, port, path, query, or fragment.");
  }

  if (projectRef === TEST_PROJECT_REF) return "test";
  if (projectRef === PRODUCTION_PROJECT_REF) {
    if (!allowProduction) {
      throw new Error("Production writes are blocked. Review the dry run and add --allow-production only at an approved gate.");
    }
    return "production";
  }
  throw new Error("Course import writes are restricted to the canonical BMH Institute test or production Supabase project.");
}
