import { timingSafeEqual } from "node:crypto";

import { reconcilePendingSandraCourseCompletions } from "@/lib/integrations/sandra/course-completed";
export const dynamic = "force-dynamic";
// Next.js requires route-segment config exports to be statically analyzable.
export const maxDuration = 60;

export async function GET(request: Request) {
  if (!validCronAuthorization(request)) {
    return Response.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const result = await reconcilePendingSandraCourseCompletions();
  return Response.json(result, { status: result.ok ? 200 : 503 });
}

function validCronAuthorization(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  const authorization = request.headers.get("authorization");
  if (!secret || !authorization) return false;
  const expected = Buffer.from(`Bearer ${secret}`);
  const received = Buffer.from(authorization);
  return (
    expected.length === received.length && timingSafeEqual(expected, received)
  );
}
