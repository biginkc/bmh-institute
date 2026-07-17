const TEST_PROJECT_REF = "jvaabkchkihkjllehmft";
const PRODUCTION_PROJECT_REF = "dhvfsyteqsxagokoerrx";

export const COURSE_IMPORT_TEST_URL = `https://${TEST_PROJECT_REF}.supabase.co`;
export const COURSE_IMPORT_PRODUCTION_URL = `https://${PRODUCTION_PROJECT_REF}.supabase.co`;

export function assertCourseImportEnvironment(
  rawUrl: string,
  allowProduction: boolean,
): "test" | "production" {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new Error("Course import writes require a canonical Supabase project URL.");
  }
  if (
    url.protocol !== "https:" ||
    url.username !== "" ||
    url.password !== "" ||
    url.port !== "" ||
    url.pathname !== "/" ||
    url.search !== "" ||
    url.hash !== ""
  ) {
    throw new Error("Course import writes require a canonical HTTPS Supabase project URL with no credentials, port, path, query, or fragment.");
  }

  if (url.hostname === `${TEST_PROJECT_REF}.supabase.co`) return "test";
  if (url.hostname === `${PRODUCTION_PROJECT_REF}.supabase.co`) {
    if (!allowProduction) {
      throw new Error("Production writes are blocked. Review the dry run and add --allow-production only at an approved gate.");
    }
    return "production";
  }
  throw new Error("Course import writes are restricted to the canonical BMH Institute test or production Supabase project.");
}
