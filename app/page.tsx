"use client";

import Link from "next/link";
import {
  ArrowRight,
  Clock,
  FileCheck2,
  Scale,
  ShieldCheck,
  WifiOff,
} from "lucide-react";
import { Button, ThemeToggleButton } from "@/components/ui/primitives";
import { HeroProductPreview } from "@/components/landing/hero-preview";
import { TaglineReveal } from "@/components/landing/tagline-reveal";
import { SiteFooter } from "@/components/site-footer";

const STEPS = [
  {
    num: "01",
    title: "Commit the paper before the exam opens",
    body: "Examiners build blueprint-balanced exams, assign classes or sections, define test rules, and lock a SHA-256 seed commitment so randomization can be audited afterwards.",
  },
  {
    num: "02",
    title: "Answer without losing a keystroke offline",
    body: "Every candidate response persists to IndexedDB first with a monotonic sequence number and syncs automatically on reconnect while the server clock enforces deadlines.",
  },
  {
    num: "03",
    title: "Grade, audit, and verify publicly",
    body: "Objective items grade atomically, written responses follow rubrics, disputes attach chronological timelines, and every result carries a public QR verification code.",
  },
];

const GUARANTEES = [
  {
    icon: WifiOff,
    title: "Survives campus Wi-Fi drops",
    body: "IndexedDB persistence queues answers with monotonic client sequence numbers and flushes automatically after session refresh on reconnect.",
  },
  {
    icon: Clock,
    title: "Server-authoritative deadlines",
    body: "Timers synchronize with /api/time and server deadlines. Local device clock changes never extend an active examination attempt.",
  },
  {
    icon: ShieldCheck,
    title: "Tamper-evident SHA-256 ledger",
    body: "Answers, events, and lock logs form cryptographic chains backed by HMAC receipts. Silent database edits surface immediately in Public Verify.",
  },
  {
    icon: Scale,
    title: "Fairness and transparent disputes",
    body: "Integrity signals assist human review without automated failure. Ambiguous question rulings can re-score every affected candidate fairly.",
  },
];

export default function HomePage() {
  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <a href="#main-content" className="skip-link">
        Skip to main content
      </a>

      {/* Minimal Top-Right Theme Switch Only */}
      <div className="mx-auto flex w-full max-w-6xl justify-end px-4 pt-5 sm:px-6">
        <ThemeToggleButton showLabel />
      </div>

      <main id="main-content" className="flex-1">
        {/* NIIT-Inspired Asymmetric Split Hero on #f5f8f6 (Light) / #113b32 (Dark) */}
        <section className="mx-auto max-w-6xl px-4 pt-12 pb-16 sm:px-6 sm:pt-20 sm:pb-24">
          <div className="grid items-center gap-10 lg:grid-cols-12 lg:gap-12">
            <div className="lg:col-span-6 space-y-6 animate-fade-rise">
              <div className="inline-flex items-center gap-2 rounded-full border border-border bg-surface px-3 py-1 text-xs font-medium text-foreground">
                <span className="h-2 w-2 rounded-full bg-portal-live" />
                NASTP Institute of Information Technology · EMS
              </div>

              <h1 className="font-display text-4xl sm:text-5xl font-extrabold uppercase leading-[1.08] tracking-[0.02em] text-foreground">
                <span className="block">EXAMINATION</span>
                <span className="block text-accent">MANAGEMENT</span>
                <span className="block">PORTAL</span>
              </h1>

              <p className="text-base text-ink-muted max-w-[540px] leading-relaxed">
                Failure-resilient, cryptographically verifiable examinations built for university campuses. Every answer persists locally in IndexedDB first, syncs in order, chains with SHA-256 hashes, and issues a server-signed receipt.
              </p>

              <div className="flex flex-wrap items-center gap-3 pt-1">
                <Link href="/login">
                  <Button size="lg">
                    Open Portal
                    <ArrowRight className="h-4 w-4" strokeWidth={1.75} />
                  </Button>
                </Link>
                <Link href="/verify">
                  <Button variant="secondary" size="lg">
                    <FileCheck2 className="h-4 w-4 text-verified" strokeWidth={1.75} />
                    Verify Receipt
                  </Button>
                </Link>
              </div>

              <div className="flex flex-wrap items-center gap-x-6 gap-y-2 border-t border-border pt-5 text-xs text-ink-subtle">
                <span className="inline-flex items-center gap-1.5">
                  <span className="h-1.5 w-1.5 rounded-full bg-portal-live" />
                  System operational · Lahore, Pakistan
                </span>
                <span>Zero webcam or screen surveillance</span>
              </div>
            </div>

            <div className="lg:col-span-6">
              <HeroProductPreview />
            </div>
          </div>
        </section>

        {/* Scroll-Driven Tagline Reveal */}
        <section className="border-y border-border bg-surface-subtle">
          <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-24">
            <TaglineReveal text="A dropped connection should never erase a student's work, and a grade should never require blind trust. Every save, timer tick, and score leaves verifiable cryptographic proof." />
          </div>
        </section>

        {/* How It Works — 3-Step Sequence */}
        <section id="how-it-works" className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-24">
          <div className="max-w-xl">
            <h2 className="font-display text-2xl sm:text-3xl font-bold uppercase tracking-[0.02em] text-foreground">
              Three Stages From Paper Commit To Public Verification
            </h2>
            <p className="mt-3 text-sm sm:text-base text-ink-muted">
              Every examination follows a deterministic institutional lifecycle protecting both academic rigor and student fairness.
            </p>
          </div>

          <div className="mt-12 grid gap-8 md:grid-cols-3">
            {STEPS.map((s) => (
              <div key={s.num} className="border-t-2 border-accent pt-5 space-y-2.5">
                <span className="font-mono text-xs font-bold text-accent tabular-nums">
                  STEP {s.num}
                </span>
                <h3 className="font-display text-lg font-semibold text-foreground">{s.title}</h3>
                <p className="text-sm leading-relaxed text-ink-muted">{s.body}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Architecture Guarantees — Crisp 2px Hairline Grid */}
        <section id="architecture" className="border-t border-border bg-surface-subtle">
          <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-24">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
              <div className="max-w-xl">
                <h2 className="font-display text-2xl sm:text-3xl font-bold uppercase tracking-[0.02em] text-foreground">
                  Designed For Exam-Day Reality
                </h2>
                <p className="mt-2 text-sm sm:text-base text-ink-muted">
                  Operational reliability, class datesheets, admit cards, and cryptographic transparency in one platform.
                </p>
              </div>
              <Link
                href="/verify"
                className="inline-flex items-center gap-1.5 text-sm font-semibold text-accent hover:underline"
              >
                Inspect public audit tool
                <ArrowRight className="h-4 w-4" />
              </Link>
            </div>

            <div className="mt-10 grid gap-px overflow-hidden rounded-[2px] border border-border bg-border sm:grid-cols-2">
              {GUARANTEES.map((g) => {
                const Icon = g.icon;
                return (
                  <div key={g.title} className="bg-surface p-6 sm:p-8 space-y-3">
                    <span className="inline-flex h-9 w-9 items-center justify-center rounded-[2px] border border-border bg-accent-soft text-accent">
                      <Icon className="h-4.5 w-4.5" strokeWidth={1.7} />
                    </span>
                    <h3 className="font-display text-base font-semibold text-foreground">
                      {g.title}
                    </h3>
                    <p className="text-sm leading-relaxed text-ink-muted">{g.body}</p>
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        {/* Final Institutional CTA Banner */}
        <section className="border-t border-border bg-background">
          <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-20">
            <div className="flex flex-col items-start justify-between gap-6 rounded-[2px] border border-border portal-chrome p-8 sm:flex-row sm:items-center sm:p-10 surface-elevated">
              <div className="max-w-xl space-y-2">
                <h2 className="font-display text-2xl font-bold uppercase tracking-[0.02em] text-[#f5f8f6]">
                  Ready To Enter The Examination Portal?
                </h2>
                <p className="text-sm text-[#f5f8f6]/80">
                  Sign in as an Administrator, Examiner, or Candidate, or register a student account linked to your class and section.
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-3 shrink-0">
                <Link href="/login">
                  <button
                    type="button"
                    className="inline-flex h-11 items-center gap-2 rounded-[2px] bg-[#f5f8f6] px-5 text-sm font-semibold text-[#15201d] hover:bg-[#6ee7b7] transition-colors cursor-pointer"
                  >
                    Open Portal
                    <ArrowRight className="h-4 w-4" />
                  </button>
                </Link>
                <Link href="/register">
                  <button
                    type="button"
                    className="inline-flex h-11 items-center gap-2 rounded-[2px] border border-[#f5f8f6]/35 bg-transparent px-5 text-sm font-semibold text-[#f5f8f6] hover:bg-[#f5f8f6]/10 transition-colors cursor-pointer"
                  >
                    Student Sign Up
                  </button>
                </Link>
              </div>
            </div>
          </div>
        </section>
      </main>

      <SiteFooter />
    </div>
  );
}
