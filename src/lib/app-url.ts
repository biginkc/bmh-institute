const PRODUCTION_APP_URL = "https://institute.bmhgroupkc.com";
const LOCAL_APP_URL = "http://localhost:3100";

export function getAppUrl(): string {
  const configured = process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (configured) return configured.replace(/\/$/, "");

  return process.env.NODE_ENV === "production" ? PRODUCTION_APP_URL : LOCAL_APP_URL;
}
