export function assertCanonicalSupabaseProjectUrl(
  rawUrl: string,
  allowedProjectRefs: readonly string[],
): string {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new Error("Unexpected production URL: expected a canonical Supabase project URL.");
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
    throw new Error("Unexpected production URL: expected canonical HTTPS with no credentials, port, path, query, or fragment.");
  }
  const projectRef = allowedProjectRefs.find(
    (candidate) => url.hostname === `${candidate}.supabase.co`,
  );
  if (!projectRef) {
    throw new Error("Unexpected production URL: Supabase project is outside the approved boundary.");
  }
  if (
    rawUrl !== `https://${projectRef}.supabase.co` &&
    rawUrl !== `https://${projectRef}.supabase.co/`
  ) {
    throw new Error("Unexpected production URL: URL text is not the exact canonical project URL.");
  }
  return projectRef;
}
