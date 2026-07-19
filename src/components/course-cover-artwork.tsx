type CourseCoverArtworkProps = {
  imageUrl?: string;
  alt: string;
  size?: "rail" | "hero" | "course";
};

const sizeClasses = {
  rail: "h-16 w-[6.4rem] shrink-0 rounded-[var(--bmh-radius-md)]",
  hero: "aspect-[16/10] w-full max-w-[420px] rounded-[var(--bmh-radius-xl)]",
  course: "aspect-[16/10] w-full rounded-[var(--bmh-radius-xl)]",
} as const;

/**
 * Renders private course artwork only after the server has exchanged its
 * storage path for a short-lived URL. Runtime Supabase hosts are environment
 * specific, so the signed image intentionally uses a native image element.
 */
export function CourseCoverArtwork({
  imageUrl,
  alt,
  size = "hero",
}: CourseCoverArtworkProps) {
  return (
    <div
      className={`relative overflow-hidden border border-black/10 bg-[var(--thumb-blue)] shadow-[var(--bmh-shadow-sm)] ${sizeClasses[size]}`}
      data-course-cover-state={imageUrl ? "signed" : "fallback"}
    >
      {imageUrl ? (
        // Signed URLs can point at different Supabase hosts in local, QA, and production.
        // eslint-disable-next-line @next/next/no-img-element
        <img src={imageUrl} alt={alt} className="h-full w-full object-cover" />
      ) : (
        <div
          role="img"
          aria-label={`${alt} placeholder`}
          className="flex h-full w-full items-center justify-center bg-[linear-gradient(135deg,var(--thumb-blue),var(--surface-hero))] px-4 text-center"
        >
          <span className="font-[family-name:var(--font-display)] text-sm font-extrabold tracking-[0.12em] text-[var(--ink-800)] uppercase">
            BMH Institute
          </span>
        </div>
      )}
    </div>
  );
}
