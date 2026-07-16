import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

import type { Database } from "./types";

export function isPublicPath(path: string, nodeEnv = process.env.NODE_ENV) {
  return (
    path.startsWith("/login") ||
    path.startsWith("/forgot-password") ||
    path.startsWith("/reset-password") ||
    path.startsWith("/invite") ||
    path.startsWith("/auth") ||
    path.startsWith("/api/webhooks") ||
    path.startsWith("/api/cron") ||
    (nodeEnv !== "production" && path.startsWith("/design-system"))
  );
}

export async function updateSession(request: NextRequest) {
  const path = request.nextUrl.pathname;

  // The unlinked specimen is a local QC surface and must not require project credentials.
  if (process.env.NODE_ENV !== "production" && path.startsWith("/design-system")) {
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

  if (!user && !isPublicPath(path)) {
    // Preserve the original path + query so the login flow can bounce the
    // user back after sign-in. Mirrors Sandra CRM's bounce behaviour.
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", path + request.nextUrl.search);
    return NextResponse.redirect(url);
  }

  return supabaseResponse;
}
