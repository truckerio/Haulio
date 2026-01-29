import Link from "next/link";
import { cn } from "@/lib/utils";

type InlineHelperProps = {
  text: string;
  href?: string;
  className?: string;
};

export function InlineHelper({ text, href, className }: InlineHelperProps) {
  if (href) {
    return (
      <Link
        href={href}
        className={cn(
          "text-xs text-[color:var(--color-text-muted)] underline-offset-2 hover:text-ink hover:underline",
          className
        )}
      >
        {text}
      </Link>
    );
  }

  return <div className={cn("text-xs text-[color:var(--color-text-muted)]", className)}>{text}</div>;
}
