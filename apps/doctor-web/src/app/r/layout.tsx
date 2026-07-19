import { notFound } from "next/navigation";
import type { ReactNode } from "react";

export default function LegacyReportLayout({ children }: { children: ReactNode }) {
  if (process.env.HEYJULE_ENABLE_LEGACY_REPORTS !== "true") notFound();
  return children;
}
