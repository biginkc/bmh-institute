import { Fragment, type ReactNode } from "react";
import Link from "next/link";

export type Crumb = { label: string; href?: string };

export type PageHeaderProps = {
  title: string;
  description?: ReactNode;
  breadcrumb?: Crumb[];
  actions?: ReactNode;
};

export function PageHeader({
  title,
  description,
  breadcrumb,
  actions,
}: PageHeaderProps) {
  return (
    <header className="flex flex-col gap-3">
      {breadcrumb && breadcrumb.length > 0 ? (
        <nav
          aria-label="Breadcrumb"
          className="flex flex-wrap items-center gap-2 font-[family-name:var(--font-body)] text-xs font-bold text-[var(--text-muted)]"
        >
          {breadcrumb.map((crumb, i) => {
            const last = i === breadcrumb.length - 1;
            return (
              <Fragment key={`${crumb.label}-${i}`}>
                {i > 0 ? <span aria-hidden>/</span> : null}
                {crumb.href && !last ? (
                  <Link
                    href={crumb.href}
                    className="transition-colors hover:text-[var(--action)]"
                  >
                    {crumb.label}
                  </Link>
                ) : (
                  <span className={last ? "text-[var(--ink-900)]" : ""}>
                    {crumb.label}
                  </span>
                )}
              </Fragment>
            );
          })}
        </nav>
      ) : null}
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between md:gap-8">
        <div className="flex min-w-0 flex-col gap-1.5">
          <h1 className="font-[family-name:var(--font-display)] text-3xl leading-tight font-extrabold tracking-[-0.02em] text-[var(--ink-900)]">
            {title}
          </h1>
          {description ? (
            <p className="max-w-3xl font-[family-name:var(--font-body)] text-sm font-semibold leading-relaxed text-[var(--text-muted)]">
              {description}
            </p>
          ) : null}
        </div>
        {actions ? (
          <div className="flex shrink-0 items-center gap-3">{actions}</div>
        ) : null}
      </div>
    </header>
  );
}
