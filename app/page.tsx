"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowRight,
  ClipboardCheck,
  GraduationCap,
  ShieldCheck,
  UserCog,
  X,
} from "lucide-react";
import { InkCursor } from "@/components/landing/ink-cursor";
import { WhaleBackground } from "@/components/landing/whale-background";

const ROLES = [
  {
    id: "admin",
    title: "Login as Administrator",
    badge: "Admin Panel",
    description: "Manage users, roles, platform analytics, audit logs & cryptographic integrity.",
    icon: UserCog,
    href: "/login?role=admin",
  },
  {
    id: "examiner",
    title: "Login as Examiner",
    badge: "Examiner Portal",
    description: "Create fair blueprint exams, enroll classes, monitor live & grade submissions.",
    icon: ClipboardCheck,
    href: "/login?role=examiner",
  },
  {
    id: "student",
    title: "Login as Student",
    badge: "Student Portal",
    description: "Take offline-resilient exams, collect signed SHA-256 receipts & view results.",
    icon: GraduationCap,
    href: "/login?role=student",
  },
] as const;

export default function HomePage() {
  const router = useRouter();
  const [roleModalOpen, setRoleModalOpen] = useState(false);

  return (
    <div className="relative flex min-h-screen flex-col overflow-hidden bg-[#f8fbf9] text-[#15201d]">
      {/* Subtle Background Curved Waves */}
      <svg
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 h-full w-full"
        preserveAspectRatio="none"
        viewBox="0 0 1440 820"
      >
        <path
          d="M0,180 C340,60 520,260 920,120 C1180,30 1320,90 1440,140 L1440,0 L0,0 Z"
          fill="#eef7f2"
          opacity="0.7"
        />
        <path
          d="M720,820 C880,620 1120,580 1440,480 L1440,820 Z"
          fill="#e7f4ed"
          opacity="0.75"
        />
        {/* Bottom-left deep forest curve */}
        <path d="M0,740 Q150,775 280,820 L0,820 Z" fill="#135c3c" />
        <path d="M0,768 Q125,792 220,820 L0,820 Z" fill="#0d442c" />
        {/* Bottom-right deep forest curve */}
        <path d="M1260,820 Q1350,715 1440,685 L1440,820 Z" fill="#167c4f" />
        <path d="M1325,820 Q1385,748 1440,730 L1440,820 Z" fill="#0c482e" />
      </svg>

      <WhaleBackground />

      {/* Top Navigation */}
      <header className="relative z-10 mx-auto flex w-full max-w-6xl items-center justify-between px-6 py-6 sm:px-10">
        <Link href="/" className="inline-flex items-center gap-3">
          <span className="flex h-11 w-11 items-center justify-center rounded-xl border-2 border-[#0e4e32] bg-white text-[#0e4e32] shadow-2xs">
            <GraduationCap className="h-6 w-6" />
          </span>
          <span className="text-xl font-bold tracking-tight text-[#0d462d]">
            Exam Portal
          </span>
        </Link>

        <div className="flex items-center gap-3">
          <Link
            href="/verify"
            className="inline-flex items-center gap-1.5 rounded-full border border-[#c7dfd4] bg-white/90 px-4 py-2 text-xs font-semibold text-[#113b32] shadow-2xs transition hover:bg-[#e6f1ec]"
          >
            <ShieldCheck className="h-4 w-4 text-[#168a57]" />
            Public Verify
          </Link>
        </div>
      </header>

      {/* Main Split Hero */}
      <main className="relative z-10 mx-auto flex w-full max-w-6xl flex-1 items-center px-6 pb-16 pt-4 sm:px-10">
        <div className="grid w-full items-center gap-12 lg:grid-cols-12">
          {/* Left Hero Typography & CTA */}
          <div className="lg:col-span-6 space-y-6">
            <h1 className="font-display text-6xl font-black uppercase leading-[0.95] tracking-tight sm:text-7xl lg:text-[5.25rem]">
              <span className="block text-[#0b4f32]">EXAM</span>
              <span className="block text-[#168a57]">PORTAL</span>
            </h1>

            <p className="text-xl font-medium text-[#1b4332] sm:text-2xl">
              Effortless Exam Management.
            </p>

            <div className="pt-2">
              <button
                type="button"
                onClick={() => setRoleModalOpen(true)}
                className="inline-flex items-center gap-2.5 rounded-full bg-[#0e5135] px-8 py-4 text-base font-semibold text-white shadow-lg shadow-[#0e5135]/25 transition-all hover:bg-[#0a3d27] hover:shadow-xl hover:-translate-y-0.5 cursor-pointer"
              >
                <span>Start Here</span>
                <ArrowRight className="h-5 w-5" />
              </button>
            </div>
          </div>

          {/* Right Clipboard + Shield + Pen Illustration */}
          <div className="relative flex items-center justify-center lg:col-span-6">
            <div className="relative h-[340px] w-[360px] sm:h-[400px] sm:w-[440px]">
              {/* Subtle Orbit Rings & Dot Matrix */}
              <svg
                aria-hidden="true"
                viewBox="0 0 440 400"
                className="h-full w-full drop-shadow-sm"
              >
                {/* Concentric soft rings */}
                <circle cx="225" cy="200" r="145" fill="none" stroke="#d5ebe0" strokeWidth="1.5" />
                <circle cx="225" cy="200" r="185" fill="none" stroke="#e4f2eb" strokeWidth="1" />

                {/* Top-right 4x3 dot grid */}
                {[0, 1, 2, 3].map((col) =>
                  [0, 1, 2].map((row) => (
                    <circle
                      key={`${col}-${row}`}
                      cx={365 + col * 14}
                      cy={88 + row * 14}
                      r="2.6"
                      fill="#168a57"
                      opacity="0.7"
                    />
                  ))
                )}

                {/* Angled Green Pen behind clipboard */}
                <g transform="translate(115, 110) rotate(-22)">
                  <rect x="0" y="0" width="18" height="140" rx="9" fill="#0d4d31" />
                  <rect x="4" y="10" width="5" height="90" rx="2.5" fill="#1e8e5a" opacity="0.55" />
                  <rect x="0" y="42" width="18" height="7" fill="#d9efe4" />
                  <polygon points="0,136 18,136 9,158" fill="#093823" />
                </g>

                {/* Main Clipboard Body (slight tilt matching reference) */}
                <g transform="translate(155, 76) rotate(9)">
                  {/* Soft shadow */}
                  <rect x="10" y="20" width="168" height="224" rx="20" fill="#0c482e" opacity="0.16" />
                  {/* Outer green board */}
                  <rect x="0" y="10" width="168" height="222" rx="18" fill="#158051" />
                  {/* Inner crisp white paper */}
                  <rect x="10" y="20" width="148" height="202" rx="12" fill="#ffffff" />
                  {/* Top clipboard metal/green clip */}
                  <rect x="48" y="0" width="72" height="26" rx="10" fill="#0d5938" />
                  <circle cx="84" cy="11" r="4.5" fill="#d8f0e4" />

                  {/* Checklist Row 1 (checked dark green) */}
                  <rect x="26" y="48" width="22" height="22" rx="5" fill="none" stroke="#0d4d31" strokeWidth="3" />
                  <path d="M31 59 L36 64 L46 52" fill="none" stroke="#0d4d31" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
                  <rect x="58" y="53" width="76" height="6" rx="3" fill="#cdd9d3" />
                  <rect x="58" y="64" width="52" height="5" rx="2.5" fill="#e1eae5" />

                  {/* Checklist Row 2 (checked emerald) */}
                  <rect x="26" y="88" width="22" height="22" rx="5" fill="none" stroke="#168a57" strokeWidth="2.5" />
                  <path d="M31 99 L36 104 L46 92" fill="none" stroke="#168a57" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
                  <rect x="58" y="93" width="72" height="6" rx="3" fill="#d5e0da" />
                  <rect x="58" y="104" width="46" height="5" rx="2.5" fill="#e5ede9" />

                  {/* Checklist Row 3 (checked emerald) */}
                  <rect x="26" y="128" width="22" height="22" rx="5" fill="none" stroke="#3aa775" strokeWidth="2.5" />
                  <path d="M31 139 L36 144 L45 133" fill="none" stroke="#3aa775" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
                  <rect x="58" y="133" width="66" height="6" rx="3" fill="#dce5e0" />
                  <rect x="58" y="144" width="42" height="5" rx="2.5" fill="#e9f0ec" />

                  {/* Checklist Row 4 (empty) */}
                  <rect x="26" y="168" width="22" height="22" rx="5" fill="none" stroke="#7fb99d" strokeWidth="2.5" />
                  <rect x="58" y="173" width="60" height="6" rx="3" fill="#e1eae5" />
                </g>

                {/* Overlapping Shield with Graduation Cap (bottom-right of clipboard) */}
                <g transform="translate(248, 152)">
                  <path
                    d="M66 6 L124 28 V82 C124 126 96 156 66 170 C36 156 8 126 8 82 V28 Z"
                    fill="#0d4d31"
                    opacity="0.16"
                    transform="translate(4, 10)"
                  />
                  <path
                    d="M66 4 L126 26 V80 C126 125 97 156 66 170 C35 156 6 125 6 80 V26 Z"
                    fill="#eef6f2"
                    stroke="#d3e6dc"
                    strokeWidth="2"
                  />
                  <path
                    d="M66 14 L116 33 V79 C116 117 92 144 66 156 C40 144 16 117 16 79 V33 Z"
                    fill="#12784b"
                  />
                  {/* Graduation cap icon inside shield */}
                  <polygon points="66,54 102,70 66,86 30,70" fill="#ffffff" />
                  <path
                    d="M44 79 V96 C44 103 54 108 66 108 C78 108 88 103 88 96 V79 L66 89 Z"
                    fill="#ffffff"
                    opacity="0.95"
                  />
                  <line x1="97" y1="73" x2="97" y2="98" stroke="#ffffff" strokeWidth="3" strokeLinecap="round" />
                  <circle cx="97" cy="100" r="3.5" fill="#ffffff" />
                </g>

                {/* Floating Check Badge Left */}
                <g transform="translate(96, 198)">
                  <circle cx="20" cy="20" r="18" fill="#ffffff" filter="drop-shadow(0 6px 12px rgba(14,81,53,0.16))" />
                  <circle cx="20" cy="20" r="13" fill="#157a4d" />
                  <path d="M14 20 L18.5 24.5 L26.5 16" fill="none" stroke="#ffffff" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
                </g>

                {/* Floating Check Badge Bottom Right */}
                <g transform="translate(344, 300)">
                  <circle cx="20" cy="20" r="18" fill="#ffffff" filter="drop-shadow(0 6px 12px rgba(14,81,53,0.16))" />
                  <circle cx="20" cy="20" r="13" fill="#126e45" />
                  <path d="M14 20 L18.5 24.5 L26.5 16" fill="none" stroke="#ffffff" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
                </g>
              </svg>
            </div>
          </div>
        </div>
      </main>

      <InkCursor />

      {/* Inline Role Selection Pop-up Modal */}
      {roleModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-[#092419]/60 p-4 backdrop-blur-xs"
          role="dialog"
          aria-modal="true"
          aria-labelledby="role-modal-title"
          onClick={() => setRoleModalOpen(false)}
        >
          <div
            className="w-full max-w-3xl rounded-2xl border border-[#d4e4dc] bg-white p-6 shadow-2xl sm:p-8 animate-fade-rise"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-4 border-b border-[#e4e7e6] pb-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-widest text-[#168a57]">
                  Select Your Portal
                </p>
                <h2
                  id="role-modal-title"
                  className="mt-1 font-display text-2xl font-bold text-[#15201d]"
                >
                  How would you like to sign in?
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setRoleModalOpen(false)}
                className="rounded-xl p-2 text-[#5f6b68] hover:bg-[#eef5f1] hover:text-[#15201d] cursor-pointer"
                aria-label="Close modal"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* 3 Inline Role Cards */}
            <div className="mt-6 grid gap-4 sm:grid-cols-3">
              {ROLES.map((item) => {
                const Icon = item.icon;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => router.push(item.href)}
                    className="group flex flex-col justify-between rounded-2xl border border-[#d8e6df] bg-[#f7fbf9] p-5 text-left transition-all hover:border-[#1b4d3e] hover:bg-[#e6f1ec] hover:shadow-md cursor-pointer"
                  >
                    <div>
                      <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-[#1b4d3e] text-white shadow-xs transition-transform group-hover:scale-105">
                        <Icon className="h-6 w-6" />
                      </span>
                      <p className="mt-4 text-[11px] font-semibold uppercase tracking-wider text-[#168a57]">
                        {item.badge}
                      </p>
                      <h3 className="mt-1 text-base font-bold text-[#15201d]">
                        {item.title}
                      </h3>
                      <p className="mt-2 text-xs leading-relaxed text-[#5f6b68]">
                        {item.description}
                      </p>
                    </div>
                    <div className="mt-5 inline-flex items-center gap-1.5 text-xs font-semibold text-[#1b4d3e]">
                      <span>Continue</span>
                      <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-1" />
                    </div>
                  </button>
                );
              })}
            </div>

            <div className="mt-6 flex flex-wrap items-center justify-between gap-2 border-t border-[#e4e7e6] pt-4 text-xs text-[#5f6b68]">
              <span>Looking to verify a certificate or hash chain?</span>
              <Link
                href="/verify"
                className="inline-flex items-center gap-1 font-semibold text-[#1b4d3e] hover:underline"
              >
                Open Public Verifier <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
