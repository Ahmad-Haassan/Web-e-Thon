import Link from "next/link";
import { BrandMark } from "./ui/primitives";

export function SiteFooter() {
  return (
    <footer className="border-t border-border bg-surface text-ink-muted no-print">
      <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6">
        <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
          <div className="space-y-3 lg:col-span-2">
            <Link href="/" className="inline-flex items-center gap-2.5 text-foreground">
              <BrandMark />
              <div className="leading-tight">
                <span className="block font-display text-sm font-bold uppercase tracking-[0.06em]">
                  NIIT EMS
                </span>
                <span className="block text-[10px] font-medium uppercase tracking-[0.12em] text-ink-subtle">
                  NASTP Institute of Information Technology
                </span>
              </div>
            </Link>
            <p className="max-w-sm text-sm text-ink-muted">
              Failure-resilient, cryptographically verifiable examination management portal designed for campus networks and transparent academic assessment.
            </p>
          </div>

          <div className="space-y-2.5 text-sm">
            <p className="text-xs font-semibold uppercase tracking-[0.06em] text-foreground">
              Portal
            </p>
            <ul className="space-y-2">
              <li>
                <Link href="/login" className="hover:text-foreground transition-colors">
                  Sign in to portal
                </Link>
              </li>
              <li>
                <Link href="/register" className="hover:text-foreground transition-colors">
                  Candidate registration
                </Link>
              </li>
              <li>
                <Link href="/verify" className="hover:text-foreground transition-colors">
                  Public verification audit
                </Link>
              </li>
            </ul>
          </div>

          <div className="space-y-2.5 text-sm">
            <p className="text-xs font-semibold uppercase tracking-[0.06em] text-foreground">
              Institutional Support
            </p>
            <ul className="space-y-2">
              <li>https://niit.edu.pk</li>
              <li>admin@niit.edu.pk</li>
              <li>Lahore, Pakistan</li>
            </ul>
          </div>
        </div>

        <div className="mt-10 flex flex-col gap-3 border-t border-border pt-6 text-xs text-ink-subtle sm:flex-row sm:items-center sm:justify-between">
          <p>NIIT EMS · Privacy-first academic assessments. No webcam or screen surveillance.</p>
          <p className="font-mono tabular-nums">SHA-256 Ledger · Server-Authoritative Timing</p>
        </div>
      </div>
    </footer>
  );
}
