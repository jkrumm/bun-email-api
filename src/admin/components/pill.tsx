import type { ReactNode } from "react";

export function Pill({
  children,
  variant = "outline",
}: {
  children: ReactNode;
  variant?: "outline" | "fill";
}) {
  return <span className={`pill pill-${variant}`}>{children}</span>;
}
