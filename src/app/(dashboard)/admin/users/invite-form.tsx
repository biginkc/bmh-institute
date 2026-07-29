import { getHugoUrl } from "@/lib/hugo-url";

export function InviteForm() {
  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm font-semibold leading-relaxed text-[var(--text-muted)]">
        Add the person and grant Institute access in Hugo. Their Institute role
        and role groups can be set here after their profile appears.
      </p>
      <a
        href={getHugoUrl()}
        className="inline-flex w-full items-center justify-center rounded-[var(--bmh-radius-md)] bg-[var(--action)] px-5 py-3 text-sm font-extrabold text-[var(--text-on-brand)] no-underline shadow-[var(--bmh-shadow-sm)] hover:bg-[var(--action-hover)]"
      >
        Add a person in Hugo
      </a>
    </div>
  );
}
