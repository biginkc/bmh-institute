export function formatDisplayName(name: string): string {
  return name.replace(
    /(^|[\s'-])(\p{L})/gu,
    (_, boundary: string, letter: string) =>
      `${boundary}${letter.toLocaleUpperCase()}`,
  );
}
