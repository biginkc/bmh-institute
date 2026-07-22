export type LessonTimingStage =
  | "middleware-auth"
  | "dashboard-identity-profile"
  | "lesson-membership"
  | "paired-quiz-parent"
  | "lightweight-outline"
  | "lesson-states"
  | "current-blocks"
  | "current-block-progress"
  | "current-assignment-status"
  | "selected-part-media-signing"
  | "selected-role-play-token"
  | "lesson-page-render";

export function serverTimingValue(stage: LessonTimingStage, durationMs: number): string {
  return `${stage};dur=${Math.max(0, durationMs).toFixed(1)}`;
}

export function logLessonTiming(stage: LessonTimingStage, durationMs: number): void {
  console.info(JSON.stringify({
    event: "bmh_lesson_stage_timing",
    stage,
    duration_ms: Math.round(Math.max(0, durationMs) * 10) / 10,
  }));
}

export async function withLessonTiming<T>(
  stage: LessonTimingStage,
  operation: () => Promise<T>,
): Promise<T> {
  const startedAt = performance.now();
  try {
    return await operation();
  } finally {
    logLessonTiming(stage, performance.now() - startedAt);
  }
}
