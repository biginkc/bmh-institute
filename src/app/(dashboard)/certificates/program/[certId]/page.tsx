import { notFound } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { renderCertificateHtml } from "@/lib/certificates/render";

import { CertificateLayout } from "../../course/[certId]/page";

export default async function ProgramCertificatePage({
  params,
}: {
  params: Promise<{ certId: string }>;
}) {
  const { certId } = await params;
  const supabase = await createClient();

  const { data: cert } = await supabase
    .from("program_certificates")
    .select(
      `
      id,
      certificate_number,
      issued_at,
      user_id,
      program_id,
      profiles ( full_name ),
      programs ( title, certificate_template_id )
    `,
    )
    .eq("id", certId)
    .maybeSingle();

  if (!cert) notFound();

  const programRow = firstRow(cert.programs);
  const profileRow = firstRow(cert.profiles);
  const title = programRow?.title ?? "Program";
  const fullName = profileRow?.full_name ?? "Learner";

  const templateId = programRow?.certificate_template_id as string | null;
  const { data: template } = templateId
    ? await supabase
        .from("certificate_templates")
        .select("body_html")
        .eq("id", templateId)
        .maybeSingle()
    : await supabase
        .from("certificate_templates")
        .select("body_html")
        .eq("scope", "program")
        .order("created_at")
        .limit(1)
        .maybeSingle();

  const bodyHtml =
    (template?.body_html as string | undefined) ??
    "<h1>Program Completion Certificate</h1><p>{{full_name}} completed the {{title}} program.</p>";

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

function firstRow<T>(value: T | T[] | null | undefined): T | null {
  if (!value) return null;
  if (Array.isArray(value)) return value[0] ?? null;
  return value;
}
