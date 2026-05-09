import { cn } from "@/lib/utils";

export interface BrandLockupProps
  extends Omit<React.HTMLAttributes<HTMLDivElement>, "children"> {
  mark: React.ReactNode;
  productName: string;
  subLabel: string;
}

export function BrandLockup({
  mark,
  productName,
  subLabel,
  className,
  ...props
}: BrandLockupProps) {
  return (
    <div
      data-slot="brand-lockup"
      className={cn("flex items-center gap-3", className)}
      {...props}
    >
      <div className="bg-primary flex aspect-square size-8 shrink-0 items-center justify-center rounded-lg">
        {mark}
      </div>
      <div className="grid min-w-0 flex-1 text-left leading-tight">
        <span className="text-foreground truncate text-base font-black tracking-wide">
          {productName}
        </span>
        <span className="text-muted-foreground truncate text-[10px] font-bold tracking-widest uppercase">
          {subLabel}
        </span>
      </div>
    </div>
  );
}
