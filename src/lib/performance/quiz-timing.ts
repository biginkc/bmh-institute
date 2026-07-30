export type QuizTimingStage = "start" | "resume" | "answer" | "finalize";

export function logQuizTiming(stage: QuizTimingStage, durationMs: number): void {
  console.info(JSON.stringify({
    event: "bmh_quiz_stage_timing",
    stage,
    duration_ms: Math.round(Math.max(0, durationMs) * 10) / 10,
  }));
}

export async function withQuizTiming<T>(
  stage: QuizTimingStage,
  operation: () => Promise<T>,
): Promise<T> {
  const startedAt = performance.now();
  try {
    return await operation();
  } finally {
    logQuizTiming(stage, performance.now() - startedAt);
  }
}
