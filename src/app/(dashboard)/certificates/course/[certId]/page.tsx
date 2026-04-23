import Link from "next/link";
import { notFound } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { renderCertificateHtml } from "@/lib/certificates/render";

import { PrintButton } from "../../print-button";

export default async function CourseCertificatePage({
  params,
}: {
  params: Promise<{ certId: string }>;
}) {
  const { certId } = await params;
  const supabase = await createClient();

  const { data: cert } = await supabase
    .from("certificates")
    .select(
      `
      id,
      certificate_number,
      issued_at,
      user_id,
      course_id,
      profiles ( full_name ),
      courses ( title, certificate_template_id )
    `,
    )
    .eq("id", certId)
    .maybeSingle();

  if (!cert) notFound();

  const courseRow = firstRow(cert.courses);
  const profileRow = firstRow(cert.profiles);
  const title = courseRow?.title ?? "Course";
  const fullName = profileRow?.full_name ?? "Learner";

  const templateId = courseRow?.certificate_template_id as string | null;
  const { data: template } = templateId
    ? await supabase
        .from("certificate_templates")
        .select("body_html")
        .eq("id", templateId)
        .maybeSingle()
    : await supabase
        .from("certificate_templates")
        .select("body_html")
        .eq("scope", "course")
        .order("created_at")
        .limit(1)
        .maybeSingle();

  const bodyHtml =
    (template?.body_html as string | undefined) ??
    "<h1>Certificate of Completion</h1><p>{{full_name}} completed {{title}}.</p>";

  const html = renderCertificateHtml(bodyHtml, {
    full_name: fullName,
    title,
    completion_date: new Date(cert.issued_at as string).toLocaleDateString(
      undefined,
      { year: "numeric", month: "long", day: "numeric" },
    ),
    certificate_number: cert.certificate_number as string,
  });

  return (
    <CertificateLayout
      backHref="/certificates"
      backLabel="Back to certificates"
      html={html}
    />
  );
}

export function CertificateLayout({
  backHref,
  backLabel,
  html,
}: {
  backHref: string;
  backLabel: string;
  html: string;
}) {
  return (
    <main className="mx-auto w-full max-w-3xl flex-1 p-6 md:p-10">
      <div className="mb-4 flex items-center justify-between print:hidden">
        <Link
          href={backHref}
          className="text-muted-foreground hover:text-foreground text-xs"
        >
          ← {backLabel}
        </Link>
        <PrintButton />
      </div>
      <div
        className="print-cert border-border rounded-md border bg-white p-6 text-neutral-900 shadow-sm print:border-0 print:shadow-none"
        dangerouslySetInnerHTML={{ __html: html }}
      />
    </main>
  );
}

function firstRow<T>(value: T | T[] | null | undefined): T | null {
  if (!value) return null;
  if (Array.isArray(value)) return value[0] ?? null;
  return value;
}
