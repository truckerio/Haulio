"use client";

import type { ReactNode } from "react";

export function AdminSettingsShell({
  title,
  subtitle,
  backAction,
  titleAlign = "left",
  actions,
  children,
}: {
  title: string;
  subtitle?: string;
  backAction?: ReactNode;
  titleAlign?: "left" | "center";
  actions?: ReactNode;
  children: ReactNode;
}) {
  const alignCenter = titleAlign === "center";
  const headerAlignment = alignCenter ? "text-center" : "";

  return (
    <div className="space-y-5">
      <div
        className={
          alignCenter
            ? "sticky top-0 z-20 rounded-[var(--radius-card)] bg-[color:var(--color-bg-muted)] pb-4 pt-2"
            : ""
        }
      >
        <div className={alignCenter ? "w-full" : ""}>
          <div className="flex flex-wrap items-start justify-between gap-3">
            {backAction ? (
              alignCenter ? (
                <div className="relative w-full">
                  <div className="absolute left-0 top-0 pt-0.5">{backAction}</div>
                  <div className="px-12 text-center">
                    <div className="text-[20px] font-semibold text-ink">{title}</div>
                    {subtitle ? <div className="text-[13px] text-[color:var(--color-text-muted)]">{subtitle}</div> : null}
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-[32px,1fr] items-start gap-3">
                  <div className="pt-0.5">{backAction}</div>
                  <div className={headerAlignment}>
                    <div className="text-[20px] font-semibold text-ink">{title}</div>
                    {subtitle ? <div className="text-[13px] text-[color:var(--color-text-muted)]">{subtitle}</div> : null}
                  </div>
                </div>
              )
            ) : (
              <div className={headerAlignment}>
                <div className="text-[20px] font-semibold text-ink">{title}</div>
                {subtitle ? <div className="text-[13px] text-[color:var(--color-text-muted)]">{subtitle}</div> : null}
              </div>
            )}
            {actions ? <div className="flex w-full flex-wrap items-center justify-end gap-2 sm:w-auto">{actions}</div> : null}
          </div>
        </div>
      </div>
      <div className="space-y-6">{children}</div>
    </div>
  );
}
