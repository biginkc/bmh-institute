const LEARNER_DATE_FORMAT = {
  day: "numeric",
  month: "numeric",
  year: "numeric",
  timeZone: "UTC",
} as const;

const LEARNER_DATE_TIME_FORMAT = {
  ...LEARNER_DATE_FORMAT,
  hour: "numeric",
  minute: "2-digit",
} as const;

/** Keep persisted timestamps identical across the server render and browser hydration. */
export function formatLearnerDate(value: string | Date): string {
  return new Intl.DateTimeFormat("en-US", LEARNER_DATE_FORMAT).format(new Date(value));
}

export function formatLearnerDateTime(value: string | Date): string {
  return new Intl.DateTimeFormat("en-US", LEARNER_DATE_TIME_FORMAT).format(new Date(value));
}
