import { cache } from "react";

import { createClient } from "@/lib/supabase/server";
import { withLessonTiming } from "@/lib/performance/lesson-timing";

export type RequestProfile = {
  system_role: "owner" | "admin" | "learner";
  full_name: string;
  status: "active" | "invited" | "suspended";
};

/** One Supabase client, verified user, and profile lookup per server render. */
export const getRequestAuthContext = cache(() => withLessonTiming("dashboard-identity-profile", async () => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { supabase, user: null, profile: null };

  const { data: profile } = await supabase
    .from("profiles")
    .select("system_role, full_name, status")
    .eq("id", user.id)
    .maybeSingle();

  return {
    supabase,
    user,
    profile: (profile as RequestProfile | null) ?? null,
  };
}));
