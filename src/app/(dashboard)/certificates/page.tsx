import Link from "next/link";
import {
  ArrowUpRight,
  Award,
  GraduationCap,
  LockKeyhole,
} from "lucide-react";

import { Badge } from "@/components/bmh-ds/badge";
import { Card } from "@/components/bmh-ds/card";
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
  const programCertificateEarned = (programCerts.data ?? []).length > 0;

  return (
    <main className="w-full flex-1 px-5 py-8 md:px-7 md:py-10">
      <div className="mb-7">
        <p className="font-[family-name:var(--font-body)] text-[11px] font-extrabold tracking-[0.1em] text-[var(--text-muted)] uppercase">
          Learn
        </p>
        <h1 className="mt-1 font-[family-name:var(--font-display)] text-4xl leading-tight font-extrabold tracking-[-0.01em] text-[var(--ink-900)]">
          Certificates
        </h1>
        <p className="mt-1.5 max-w-2xl font-[family-name:var(--font-body)] text-base font-semibold text-[var(--text-muted)]">
          Completed courses and programs. Update your name on your profile
          before printing.
        </p>
      </div>

      <div className="grid gap-5 sm:grid-cols-2">
        {allCerts.length === 0 ? (
          <Card padding="md" tint>
            <div className="flex items-start gap-4">
              <span className="inline-flex size-12 shrink-0 items-center justify-center rounded-[var(--bmh-radius-md)] bg-[var(--paper)] text-[var(--text-muted)]">
                <GraduationCap aria-hidden="true" size={24} />
              </span>
              <div>
                <h2 className="font-[family-name:var(--font-display)] text-lg font-bold text-[var(--ink-900)]">
                  No certificates yet
                </h2>
                <p className="mt-1 font-[family-name:var(--font-body)] text-sm font-semibold leading-relaxed text-[var(--text-muted)]">
                  Finish a course to earn your first one. Complete every course
                  in a program for a program-level certificate.
                </p>
              </div>
            </div>
          </Card>
        ) : (
          allCerts.map((c) => (
            <Link
              key={c.id}
              href={`/certificates/${c.scope}/${c.id}`}
              aria-label={`View and print ${c.title} certificate`}
              className="rounded-[var(--bmh-radius-lg)] focus-visible:ring-4 focus-visible:ring-[var(--focus-ring)] focus-visible:outline-none"
            >
              <Card interactive padding="md" className="h-full">
                <div className="flex h-full items-center gap-4">
                  <span
                    className={`inline-flex size-12 shrink-0 items-center justify-center rounded-[var(--bmh-radius-md)] ${
                      c.scope === "program"
                        ? "bg-[var(--action-soft)] text-[var(--blue-600)]"
                        : "bg-[var(--success-soft)] text-[var(--success)]"
                    }`}
                  >
                    {c.scope === "program" ? (
                      <Award aria-hidden="true" size={24} />
                    ) : (
                      <GraduationCap aria-hidden="true" size={24} />
                    )}
                  </span>
                  <div className="min-w-0 flex-1">
                    <Badge
                      tone={c.scope === "program" ? "blue" : "green"}
                      size="sm"
                    >
                      {c.scope === "program" ? "Program" : "Course"}
                    </Badge>
                    <h2 className="mt-2 font-[family-name:var(--font-display)] text-lg leading-tight font-bold text-[var(--ink-900)]">
                      {c.title}
                    </h2>
                    <p className="mt-1 font-[family-name:var(--font-body)] text-[13px] font-bold text-[var(--text-muted)]">
                      Issued {new Date(c.issuedAt).toLocaleDateString()}
                    </p>
                    <p className="mt-0.5 truncate font-[family-name:var(--font-body)] text-xs font-semibold text-[var(--ink-400)]">
                      Certificate {c.number}
                    </p>
                  </div>
                  <ArrowUpRight
                    aria-hidden="true"
                    className="shrink-0 text-[var(--action)]"
                    size={20}
                  />
                </div>
              </Card>
            </Link>
          ))
        )}

        {!programCertificateEarned ? (
          <Card padding="md" className="h-full opacity-70">
            <div className="flex h-full items-center gap-4">
              <span className="inline-flex size-12 shrink-0 items-center justify-center rounded-[var(--bmh-radius-md)] bg-[var(--ink-100)] text-[var(--ink-400)]">
                <LockKeyhole aria-hidden="true" size={22} />
              </span>
              <div>
                <h2 className="font-[family-name:var(--font-display)] text-lg leading-tight font-bold text-[var(--ink-700)]">
                  Program certificate
                </h2>
                <p className="mt-1 font-[family-name:var(--font-body)] text-[13px] font-bold text-[var(--text-muted)]">
                  Finish all courses to unlock
                </p>
              </div>
            </div>
          </Card>
        ) : null}
      </div>
    </main>
  );
}

function firstRow<T>(value: T | T[] | null | undefined): T | null {
  if (!value) return null;
  if (Array.isArray(value)) return value[0] ?? null;
  return value;
}
