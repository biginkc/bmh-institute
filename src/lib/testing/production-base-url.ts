const INSTITUTE_PRODUCTION_ORIGIN = "https://institute.bmhgroupkc.com";

export function requireInstituteProductionBaseUrl(value: string | undefined): string {
  if (!value?.trim()) {
    throw new Error("E2E_PROD_BASE_URL is required for production acceptance.");
  }

  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error("E2E_PROD_BASE_URL must be a valid absolute URL.");
  }

  if (url.origin !== INSTITUTE_PRODUCTION_ORIGIN) {
    throw new Error(`E2E_PROD_BASE_URL must target ${INSTITUTE_PRODUCTION_ORIGIN}.`);
  }
  if (url.username || url.password || url.pathname !== "/" || url.search || url.hash) {
    throw new Error("E2E_PROD_BASE_URL must be the bare canonical production origin.");
  }
  return INSTITUTE_PRODUCTION_ORIGIN;
}
