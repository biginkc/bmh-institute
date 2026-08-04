export function formatDisplayName(name: string): string {
  return name.replace(
    /(^|[\s'-])(\p{L})/gu,
    (_, boundary: string, letter: string) => {
      const capital = letter.toLocaleUpperCase();
      return `${boundary}${[...capital].length === 1 ? capital : letter}`;
    },
  );
}

export function resolveDashboardDisplayName(
  profileName: string | null | undefined,
  email: string | null | undefined,
): string {
  return profileName
    ? formatDisplayName(profileName)
    : email || "BMH Institute user";
}
