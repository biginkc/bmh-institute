import { sanitizeCertificateBodyHtml } from "@/lib/sanitize/certificate";
import { sanitizeTextBlockHtml } from "@/lib/sanitize/text-block";
import { createAdminClient } from "@/lib/supabase/admin";

type ContentBlockRow = {
  id: string;
  content: Record<string, unknown> | null;
};

type CertificateTemplateRow = {
  id: string;
  body_html: string | null;
};

async function backfillContentBlocks() {
  const admin = createAdminClient();
  const { data: rows, error } = await admin
    .from("content_blocks")
    .select("id, content")
    .eq("block_type", "text");
  if (error) throw error;

  let touched = 0;
  for (const row of (rows ?? []) as ContentBlockRow[]) {
    const html = row.content?.html;
    if (typeof html !== "string") continue;

    const safe = sanitizeTextBlockHtml(html);
    if (safe === html) continue;

    const { error: updateError } = await admin
      .from("content_blocks")
      .update({ content: { ...row.content, html: safe } })
      .eq("id", row.id);
    if (updateError) throw updateError;
    touched += 1;
  }

  console.log(`Sanitized ${touched} text content block row(s).`);
}

async function backfillCertificateTemplates() {
  const admin = createAdminClient();
  const { data: rows, error } = await admin
    .from("certificate_templates")
    .select("id, body_html");
  if (error) throw error;

  let touched = 0;
  for (const row of (rows ?? []) as CertificateTemplateRow[]) {
    const html = row.body_html;
    if (typeof html !== "string") continue;

    const safe = sanitizeCertificateBodyHtml(html);
    if (safe === html) continue;

    const { error: updateError } = await admin
      .from("certificate_templates")
      .update({ body_html: safe })
      .eq("id", row.id);
    if (updateError) throw updateError;
    touched += 1;
  }

  console.log(`Sanitized ${touched} certificate template row(s).`);
}

async function main() {
  await backfillContentBlocks();
  await backfillCertificateTemplates();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
