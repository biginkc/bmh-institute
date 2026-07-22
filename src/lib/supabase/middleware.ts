import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

import type { Database } from "./types";
import { logLessonTiming, serverTimingValue } from "@/lib/performance/lesson-timing";

export function isDesignSystemPath(path: string) {
  return path === "/design-system" || path.startsWith("/design-system/");
}

export function isPublicPath(path: string) {
  return (
    path.startsWith("/login") ||
    path.startsWith("/forgot-password") ||
    path.startsWith("/reset-password") ||
    path.startsWith("/invite") ||
    path.startsWith("/auth") ||
    path.startsWith("/api/webhooks") ||
    path.startsWith("/api/cron")
  );
}

export async function updateSession(request: NextRequest) {
  const authStartedAt = performance.now();
  const path = request.nextUrl.pathname;

  // The page owns its production 404. Skip auth here so local QC needs no project
  // credentials — but only outside production, so prod keeps the auth redirect even
  // if a future /design-system/* route ships without its own gate.
  if (process.env.NODE_ENV !== "production" && isDesignSystemPath(path)) {
    return NextResponse.next({ request });
  }

  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();
  const authDurationMs = performance.now() - authStartedAt;
  logLessonTiming("middleware-auth", authDurationMs);
  supabaseResponse.headers.set(
    "Server-Timing",
    serverTimingValue("middleware-auth", authDurationMs),
  );

  if (!user && !isPublicPath(path)) {
    // Preserve the original path + query so the login flow can bounce the
    // user back after sign-in. Mirrors Sandra CRM's bounce behaviour.
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", path + request.nextUrl.search);
    const response = NextResponse.redirect(url);
    response.headers.set(
      "Server-Timing",
      serverTimingValue("middleware-auth", authDurationMs),
    );
    return response;
  }

  return supabaseResponse;
}
