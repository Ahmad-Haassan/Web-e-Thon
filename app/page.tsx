import Link from "next/link";
import {
  ArrowRight,
  Clock,
  FileCheck2,
  Scale,
  ShieldCheck,
  WifiOff,
} from "lucide-react";

export default function HomePage() {
  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <a href="#main-content" className="skip-link">
        Skip to main content
      </a>

      <header className="border-b border-border bg-surface/90 backdrop-blur-xs">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
          <Link href="/" className="flex items-center gap-2.5 font-semibold tracking-tight">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent text-accent-ink">
              <ShieldCheck className="h-4.5 w-4.5" />
            </span>
            <span className="text-base">VeriExam</span>
          </Link>

          <div className="flex items-center gap-2.5">
            <Link
              href="/verify"
              className="rounded-lg px-3 py-2 text-sm font-medium text-ink-muted hover:bg-surface-muted hover:text-foreground"
            >
              Public Verify
            </Link>
            <Link
              href="/login"
              className="rounded-lg border border-border bg-surface px-3.5 py-2 text-sm font-medium text-foreground hover:bg-surface-muted"
            >
              Sign In
            </Link>
            <Link
              href="/register"
              className="rounded-lg bg-accent px-3.5 py-2 text-sm font-medium text-accent-ink hover:bg-accent-hover"
            >
              Student Sign Up
            </Link>
          </div>
        </div>
      </header>

      <main id="main-content" className="flex-1">
        <section className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-24">
          <div className="max-w-3xl">
            <div className="inline-flex items-center gap-2 rounded-full border border-verified/30 bg-verified-soft px-3 py-1 text-xs font-semibold text-verified">
              <ShieldCheck className="h-3.5 w-3.5" />
              Cryptographically Verifiable · Offline-First · Privacy-First
            </div>
            <h1 className="mt-5 text-4xl font-semibold tracking-tight text-foreground sm:text-5xl leading-[1.15]">
              The exam system examiners can defend and students can trust — even when the internet fails.
            </h1>
            <p className="mt-5 text-lg text-ink-muted max-w-2xl">
              Built for universities operating on real-world connections. Every answer is persisted locally in IndexedDB first, synced with monotonic sequence numbers, chained with SHA-256 hashes, and backed by server-signed receipts.
            </p>

            <div className="mt-8 flex flex-wrap items-center gap-3">
              <Link
                href="/login"
                className="inline-flex h-11 items-center gap-2 rounded-lg bg-accent px-5 text-sm font-semibold text-accent-ink hover:bg-accent-hover transition-colors"
              >
                Open Portal
                <ArrowRight className="h-4 w-4" />
              </Link>
              <Link
                href="/verify"
                className="inline-flex h-11 items-center gap-2 rounded-lg border border-border bg-surface px-5 text-sm font-semibold text-foreground hover:bg-surface-muted transition-colors"
              >
                <FileCheck2 className="h-4 w-4 text-verified" />
                Verify a Receipt / Hash Chain
              </Link>
            </div>
          </div>

          <div className="mt-16 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-xl border border-border bg-surface p-5">
              <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-lg bg-warning-soft text-warning">
                <WifiOff className="h-5 w-5" />
              </div>
              <h2 className="text-base font-semibold">Survives Disconnects</h2>
              <p className="mt-1.5 text-sm text-ink-muted">
                IndexedDB-first autosave queues answers with monotonic <code className="font-mono text-xs">clientSeq</code> and syncs seamlessly on reconnect after token refresh.
              </p>
            </div>

            <div className="rounded-xl border border-border bg-surface p-5">
              <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-lg bg-accent-soft text-accent">
                <Clock className="h-5 w-5" />
              </div>
              <h2 className="text-base font-semibold">Server-Authoritative Clock</h2>
              <p className="mt-1.5 text-sm text-ink-muted">
                Timer syncs with <code className="font-mono text-xs">/api/time</code> and server <code className="font-mono text-xs">deadlineAt</code>. Device clock tampering never extends deadlines.
              </p>
            </div>

            <div className="rounded-xl border border-border bg-surface p-5">
              <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-lg bg-verified-soft text-verified">
                <ShieldCheck className="h-5 w-5" />
              </div>
              <h2 className="text-base font-semibold">Tamper-Evident Hash Chain</h2>
              <p className="mt-1.5 text-sm text-ink-muted">
                Every saved answer and event is SHA-256 chained with HMAC-signed receipts. Public verification turns red immediately if any row is altered.
              </p>
            </div>

            <div className="rounded-xl border border-border bg-surface p-5">
              <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-lg bg-surface-muted text-foreground">
                <Scale className="h-5 w-5" />
              </div>
              <h2 className="text-base font-semibold">Fairness & Disputes</h2>
              <p className="mt-1.5 text-sm text-ink-muted">
                Blueprint-balanced question papers, privacy-first indicators (no webcam), and evidence-backed dispute resolution.
              </p>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-border bg-surface-subtle py-6 text-center text-xs text-ink-subtle">
        VeriExam · Don&apos;t trust us — verify us. Privacy-first academic assessments.
      </footer>
    </div>
  );
}
