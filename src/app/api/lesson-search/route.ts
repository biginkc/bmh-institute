import { NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";

const MAX_RESULTS = 8;
const MAX_QUERY_LENGTH = 80;

export async function GET(request: Request) {
  const query = new URL(request.url).searchParams.get("q")?.trim().slice(0, MAX_QUERY_LENGTH) ?? "";
  if (query.length < 2) {
    return NextResponse.json({ results: [] }, { headers: { "Cache-Control": "no-store" } });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ results: [] }, { status: 401 });
  }

  const { data, error } = await supabase
    .from("lessons")
    .select("id, title")
    .ilike("title", `%${query}%`)
    .order("title")
    .limit(MAX_RESULTS);

  if (error) {
    return NextResponse.json({ results: [] }, { status: 500 });
  }

  const results = (data ?? []).flatMap((lesson) =>
    typeof lesson.id === "string" && typeof lesson.title === "string"
      ? [{
          id: lesson.id,
          title: lesson.title,
          href: `/lessons/${encodeURIComponent(lesson.id)}`,
        }]
      : [],
  );
  return NextResponse.json(
    { results },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}
