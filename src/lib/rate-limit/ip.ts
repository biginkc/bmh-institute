export function extractClientIp(headersList: Headers): string {
  const forwardedFor = headersList.get("x-forwarded-for");
  if (forwardedFor) {
    const first = forwardedFor.split(",")[0]?.trim();
    if (first) return first;
  }

  const realIp = headersList.get("x-real-ip")?.trim();
  if (realIp) return realIp;

  const vercelForwardedFor = headersList.get("x-vercel-forwarded-for")?.trim();
  if (vercelForwardedFor) return vercelForwardedFor;

  return "127.0.0.1";
}
