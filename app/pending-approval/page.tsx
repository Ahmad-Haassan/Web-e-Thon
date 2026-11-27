"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Clock, LogOut, RefreshCw, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { useAuth, roleHomePath } from "@/hooks/use-auth";
import {
  Badge,
  BrandMark,
  Button,
  Spinner,
  ThemeToggleButton,
} from "@/components/ui/primitives";

export default function PendingApprovalPage() {
  const router = useRouter();
  const { user, loading, refreshUser, signOut } = useAuth();
  const [checking, setChecking] = useState(false);

  useEffect(() => {
    if (loading) return;
    if (!user) {
      router.replace("/login");
    } else if (user.active) {
      router.replace(roleHomePath(user.role));
    }
  }, [user, loading, router]);

  // Auto-check every 10 seconds so the user enters automatically once Admin approves
  useEffect(() => {
    if (!user || user.active) return;
    const interval = setInterval(async () => {
      const refreshed = await refreshUser();
      if (refreshed?.active) {
        toast.success(`Approved as ${refreshed.role}! Redirecting…`);
        router.replace(roleHomePath(refreshed.role));
      }
    }, 10_000);
    return () => clearInterval(interval);
  }, [user, refreshUser, router]);

  async function handleCheckStatus() {
    setChecking(true);
    try {
      const refreshed = await refreshUser();
      if (refreshed?.active) {
        toast.success(`Approved as ${refreshed.role}! Redirecting…`);
        router.replace(roleHomePath(refreshed.role));
      } else {
        toast.info("Still awaiting Administrator approval.");
      }
    } finally {
      setChecking(false);
    }
  }

  if (loading || !user) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Spinner className="h-5 w-5 text-accent" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col">
      <div className="mx-auto flex w-full max-w-4xl items-center justify-between px-6 pt-5">
        <Link href="/" className="inline-flex items-center gap-3">
          <span className="flex h-11 w-11 items-center justify-center rounded-[2px] border border-border bg-surface p-1.5 surface-card">
            <BrandMark className="h-8 w-8" />
          </span>
          <div className="leading-tight">
            <p className="font-display text-sm font-bold text-foreground">
              Examination Management Portal
            </p>
          </div>
        </Link>
        <ThemeToggleButton showLabel />
      </div>

      <main className="mx-auto flex w-full max-w-xl flex-1 items-center justify-center px-6 py-12">
        <div className="w-full rounded-[2px] border border-border bg-surface p-8 sm:p-10 text-center surface-elevated animate-fade-rise">
          <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-[2px] border border-warning/40 bg-warning-soft text-warning">
            <Clock className="h-7 w-7" strokeWidth={1.7} />
          </div>

          <div className="mb-3 flex justify-center">
            <Badge tone="warning">WAITING FOR ADMIN APPROVAL</Badge>
          </div>

          <h1 className="font-display text-2xl sm:text-3xl font-bold text-foreground">
            Account Pending Approval
          </h1>

          <p className="mt-3 text-sm text-ink-muted leading-relaxed">
            Your account has been registered and placed in the{" "}
            <strong className="text-foreground">Waiting Approval</strong> queue. An Administrator
            will review your email and assign your portal role (
            <strong className="text-foreground">Student</strong>,{" "}
            <strong className="text-foreground">Examiner</strong>, or{" "}
            <strong className="text-foreground">Admin</strong>).
          </p>

          <div className="mt-6 rounded-[2px] border border-border bg-surface-subtle p-4 text-left text-xs space-y-1.5">
            <div className="flex items-center justify-between gap-2">
              <span className="text-ink-subtle">Account Name</span>
              <span className="font-semibold text-foreground">{user.name}</span>
            </div>
            <div className="flex items-center justify-between gap-2">
              <span className="text-ink-subtle">Email Address</span>
              <span className="font-mono text-foreground">{user.email}</span>
            </div>
            <div className="flex items-center justify-between gap-2">
              <span className="text-ink-subtle">Status</span>
              <span className="font-semibold text-warning">Waiting for Role Assignment</span>
            </div>
          </div>

          <div className="mt-6 flex flex-col sm:flex-row items-center justify-center gap-3">
            <Button
              type="button"
              onClick={handleCheckStatus}
              disabled={checking}
              className="w-full sm:w-auto h-10"
            >
              {checking ? (
                <>
                  <Spinner className="h-4 w-4" /> Checking…
                </>
              ) : (
                <>
                  <RefreshCw className="h-4 w-4" /> Check Approval Status
                </>
              )}
            </Button>

            <Button
              type="button"
              variant="secondary"
              onClick={() => void signOut()}
              className="w-full sm:w-auto h-10"
            >
              <LogOut className="h-4 w-4" /> Sign Out
            </Button>
          </div>

          <p className="mt-6 inline-flex items-center gap-1.5 text-[11px] text-ink-subtle">
            <ShieldCheck className="h-3.5 w-3.5 text-verified" />
            Once approved, you will automatically enter your assigned role interface.
          </p>
        </div>
      </main>
    </div>
  );
}
