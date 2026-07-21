import { expectTypeOf, it } from "vitest";

import type { Database } from "./types";

it("keeps incomplete lesson completion timestamps nullable", () => {
  type CompletionState =
    Database["public"]["Functions"]["fn_admin_lesson_completion_states"]["Returns"][number];

  expectTypeOf<CompletionState["completed_at"]>().toEqualTypeOf<string | null>();
});
