import Link from "next/link";

import { Card } from "@/components/bmh-ds";
import { PageHeader } from "@/components/page-header";

import { ProgramForm } from "../program-form";
import { createProgram } from "../actions";

export default function NewProgramPage() {
  return (
    <main className="mx-auto w-full max-w-[720px] flex-1 px-5 py-8 md:px-7 md:pb-16">
      <Link
        href="/admin/programs"
        className="font-[family-name:var(--font-body)] text-sm font-bold text-[var(--action)] transition-colors hover:text-[var(--action-hover)]"
      >
        ← Back to programs
      </Link>
      <div className="mb-7 mt-3">
        <PageHeader
          title="New program"
          description="Create a learner-facing bundle, then attach its courses."
          breadcrumb={[{ label: "Admin" }, { label: "Programs" }]}
        />
      </div>
      <Card padding="md">
        <ProgramForm action={createProgram} submitLabel="Create program" />
      </Card>
    </main>
  );
}
