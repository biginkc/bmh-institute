const LOCAL_BROWSER_ORIGINS = new Set([
  "http://localhost:3200",
  "http://127.0.0.1:3200",
]);
const HUGO_PRODUCTION_ORIGINS = new Set(["https://institute.bmhgroupkc.com"]);

export function assertHugoBrowserTarget(input: {
  baseUrl: string;
  productionOptIn?: boolean;
  readOnly?: boolean;
}): { baseUrl: string; production: boolean } {
  let url: URL;
  try {
    url = new URL(input.baseUrl);
  } catch {
    throw new Error("Hugo Playwright base URL must be an absolute HTTP(S) URL.");
  }
  if (url.pathname !== "/" || url.search || url.hash) {
    throw new Error("Hugo Playwright base URL must be an origin without a path or query.");
  }
  const origin = url.origin;
  if (LOCAL_BROWSER_ORIGINS.has(origin)) return { baseUrl: origin, production: false };
  if (!HUGO_PRODUCTION_ORIGINS.has(origin)) {
    throw new Error(`Hugo Playwright target ${origin} is not an approved test or production origin.`);
  }
  if (input.productionOptIn !== true) {
    throw new Error("Hugo production browser checks require HUGO_E2E_ALLOW_PRODUCTION=1.");
  }
  if (input.readOnly !== true) {
    throw new Error("Hugo production browser checks require HUGO_E2E_READ_ONLY=1.");
  }
  return { baseUrl: origin, production: true };
}
