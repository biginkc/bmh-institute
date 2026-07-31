// Every learner is US-Central. Pinning to a fixed zone (rather than the
// server/browser's ambient zone) is what keeps server render and client
// hydration in agreement -- but the fixed zone must be the one learners are
// actually in, or a completion near midnight CDT/CST renders tomorrow's date
// on the certificate. UTC would satisfy hydration too but silently produces
// wrong dates for every real user of this app.
const LEARNER_TIME_ZONE = "America/Chicago";

const LEARNER_DATE_FORMAT = {
  day: "numeric",
  month: "numeric",
  year: "numeric",
  timeZone: LEARNER_TIME_ZONE,
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

export function formatLearnerLongDate(value: string | Date): string {
  return new Intl.DateTimeFormat("en-US", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: LEARNER_TIME_ZONE,
  }).format(new Date(value));
}
