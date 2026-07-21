import { NextResponse } from "next/server";

export async function POST() {
  return NextResponse.json(
    {
      ok: false,
      error: "legacy_invites_disabled",
    },
    { status: 410 },
  );
}
