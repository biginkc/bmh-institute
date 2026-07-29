const DEFAULT_HUGO_URL = "https://hugo.bmhgroupkc.com";

export function getHugoUrl(): string {
  const configured = process.env.NEXT_PUBLIC_HUGO_URL?.trim();
  return (configured || DEFAULT_HUGO_URL).replace(/\/$/, "");
}
