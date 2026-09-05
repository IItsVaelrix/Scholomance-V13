import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function Badge({
  className,
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full bg-bg-subtle px-2 py-0.5 font-mono text-2xs tracking-wide text-fg-muted uppercase",
        className,
      )}
    >
      {children}
    </span>
  );
}
