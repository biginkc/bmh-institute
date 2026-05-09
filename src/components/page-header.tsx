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
    <header className="flex flex-col gap-2">
      {breadcrumb && breadcrumb.length > 0 ? (
        <nav
          aria-label="Breadcrumb"
          className="text-muted-foreground flex flex-wrap items-center gap-2 text-[10px] font-bold tracking-widest uppercase"
        >
          {breadcrumb.map((crumb, i) => {
            const last = i === breadcrumb.length - 1;
            return (
              <Fragment key={`${crumb.label}-${i}`}>
                {i > 0 ? <span aria-hidden>/</span> : null}
                {crumb.href && !last ? (
                  <Link
                    href={crumb.href}
                    className="hover:text-foreground transition-colors"
                  >
                    {crumb.label}
                  </Link>
                ) : (
                  <span className={last ? "text-foreground" : ""}>
                    {crumb.label}
                  </span>
                )}
              </Fragment>
            );
          })}
        </nav>
      ) : null}
      <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between md:gap-6">
        <div className="flex min-w-0 flex-col gap-1">
          <h1 className="text-2xl leading-tight font-bold tracking-[-0.02em]">
            {title}
          </h1>
          {description ? (
            <p className="text-muted-foreground max-w-3xl text-sm">
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
