export type QuizDeadlineStage = "start" | "resume" | "answer" | "finalize";

// The browser gets a little longer than the server so a server-side timeout
// can be serialized into a useful result instead of being masked by the
// browser's own watchdog. The answer RPC's lock bound is 5s, the server bound
// is 8s, and these client bounds are deliberately outside both.
export const QUIZ_DEADLINES: Readonly<Record<QuizDeadlineStage, number>> = {
  start: 12_000,
  resume: 12_000,
  answer: 12_000,
  finalize: 14_000,
};

export const QUIZ_SERVER_DEADLINES: Readonly<Record<QuizDeadlineStage, number>> = {
  start: 8_000,
  resume: 8_000,
  answer: 8_000,
  finalize: 10_000,
};

export class QuizDeadlineError extends Error {
  readonly name = "QuizDeadlineError";

  constructor(
    readonly stage: QuizDeadlineStage,
    readonly timeoutMs: number,
  ) {
    super(`Quiz ${stage} timed out after ${timeoutMs}ms.`);
  }
}

export function withQuizSignal<T>(
  signal: AbortSignal,
  operation: () => Promise<T>,
): Promise<T> {
  if (signal.aborted) return Promise.reject(signal.reason);

  return new Promise<T>((resolve, reject) => {
    const cleanup = () => signal.removeEventListener("abort", onAbort);
    const onAbort = () => {
      cleanup();
      reject(signal.reason);
    };

    signal.addEventListener("abort", onAbort, { once: true });
    Promise.resolve()
      .then(operation)
      .then(
        (value) => {
          cleanup();
          resolve(value);
        },
        (error) => {
          cleanup();
          reject(error);
        },
      );
  });
}

export async function withQuizDeadline<T>(
  stage: QuizDeadlineStage,
  operation: (signal: AbortSignal) => Promise<T>,
  timeoutMs = QUIZ_DEADLINES[stage],
): Promise<T> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      operation(controller.signal),
      new Promise<never>((_, reject) => {
        timer = setTimeout(
          () => {
            const error = new QuizDeadlineError(stage, timeoutMs);
            controller.abort(error);
            reject(error);
          },
          timeoutMs,
        );
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
    if (!controller.signal.aborted) controller.abort();
  }
}
