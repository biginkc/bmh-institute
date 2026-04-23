import Link from "next/link";
import { Download } from "lucide-react";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { createClient } from "@/lib/supabase/server";

export default async function CertificatesPage() {
  const supabase = await createClient();

  const [courseCerts, programCerts] = await Promise.all([
    supabase
      .from("certificates")
      .select(
        "id, certificate_number, issued_at, course_id, courses(title)",
      )
      .order("issued_at", { ascending: false }),
    supabase
      .from("program_certificates")
      .select(
        "id, certificate_number, issued_at, program_id, programs(title)",
      )
      .order("issued_at", { ascending: false }),
  ]);

  const allCerts = [
    ...(programCerts.data ?? []).map((c) => ({
      id: c.id as string,
      number: c.certificate_number as string,
      issuedAt: c.issued_at as string,
      title: firstRow(c.programs)?.title ?? "Program",
      scope: "program" as const,
    })),
    ...(courseCerts.data ?? []).map((c) => ({
      id: c.id as string,
      number: c.certificate_number as string,
      issuedAt: c.issued_at as string,
      title: firstRow(c.courses)?.title ?? "Course",
      scope: "course" as const,
    })),
  ];

  return (
    <main className="mx-auto w-full max-w-3xl flex-1 p-6 md:p-10">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold">Certificates</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Every course and program you&apos;ve completed.
        </p>
      </div>

      {allCerts.length === 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>No certificates yet</CardTitle>
            <CardDescription>
              Finish a course to earn your first one. Complete every course
              in a program for a program-level certificate.
            </CardDescription>
          </CardHeader>
        </Card>
      ) : (
        <div className="grid gap-3">
          {allCerts.map((c) => (
            <Card key={c.id}>
              <CardContent className="flex items-center justify-between gap-4 p-4">
                <div>
                  <div className="text-xs uppercase tracking-wide text-muted-foreground">
                    {c.scope === "program" ? "Program" : "Course"}
                  </div>
                  <div className="mt-1 font-medium">{c.title}</div>
                  <div className="text-muted-foreground mt-1 text-xs">
                    {c.number} · issued{" "}
                    {new Date(c.issuedAt).toLocaleDateString()}
                  </div>
                </div>
                <Link
                  href={`/certificates/${c.scope}/${c.id}`}
                  className="border-border hover:bg-muted flex items-center gap-2 rounded-md border px-3 py-1.5 text-xs"
                >
                  <Download className="size-3.5" />
                  View &amp; print
                </Link>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </main>
  );
}

function firstRow<T>(value: T | T[] | null | undefined): T | null {
  if (!value) return null;
  if (Array.isArray(value)) return value[0] ?? null;
  return value;
}
