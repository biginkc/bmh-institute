export type QuizDeadlineStage = "start" | "resume" | "answer" | "finalize";

export const QUIZ_DEADLINES: Readonly<Record<QuizDeadlineStage, number>> = {
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

export async function withQuizDeadline<T>(
  stage: QuizDeadlineStage,
  operation: () => Promise<T>,
  timeoutMs = QUIZ_DEADLINES[stage],
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      operation(),
      new Promise<never>((_, reject) => {
        timer = setTimeout(
          () => reject(new QuizDeadlineError(stage, timeoutMs)),
          timeoutMs,
        );
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}
