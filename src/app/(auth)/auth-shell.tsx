import type { ReactNode } from "react";

import { Coach, Logo } from "@/components/bmh-ds";

type AuthShellProps = {
  children: ReactNode;
  message: string;
  pose: "wave" | "present" | "point";
  loginHero?: boolean;
};

export function AuthShell({
  children,
  message,
  pose,
  loginHero = false,
}: AuthShellProps) {
  return (
    <main className="grid min-h-screen bg-[var(--paper)] lg:grid-cols-[1.05fr_0.95fr]">
      <section className="flex min-h-[320px] flex-col justify-between gap-8 bg-[var(--blue-400)] px-8 py-8 sm:min-h-[400px] sm:px-12 lg:min-h-screen lg:px-16 lg:py-14">
        <Logo height={21} />

        {loginHero ? (
          <div className="max-w-[460px]">
            <h1 className="font-[family-name:var(--font-display)] text-[clamp(2.75rem,4vw,3.25rem)] leading-[1.02] font-extrabold tracking-[-0.01em] text-[var(--ink-900)]">
              Complex deals,
              <br />
              made simple.
            </h1>
            <p className="mt-4 max-w-[400px] font-[family-name:var(--font-body)] text-[17px] leading-[1.55] font-semibold text-[var(--ink-800)]">
              BMH Institute is where you learn the offer, the scripts, and the
              objection playbook one short lesson at a time.
            </p>
          </div>
        ) : null}

        <div className="hidden sm:block">
          <Coach
            pose={pose}
            tone="white"
            align="flex-end"
            height={loginHero ? 230 : 240}
            message={message}
          />
        </div>

        <span className="font-[family-name:var(--font-body)] text-[13px] font-bold text-[color:rgb(14_17_22_/_60%)]">
          BMH Group · Kansas City
        </span>
      </section>

      <section className="flex items-center justify-center bg-[var(--paper)] px-6 py-12 lg:px-10">
        <div className="flex w-full max-w-[340px] flex-col gap-[18px]">
          {children}
        </div>
      </section>
    </main>
  );
}
