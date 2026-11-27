"use client";

import Link from "next/link";
import {
  AlertTriangle,
  LogOut,
  ShieldCheck,
  SlidersHorizontal,
  UserCheck,
} from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/use-auth";
import { Badge, Button, Label, Select, Spinner } from "@/components/ui/primitives";
import type { WorkspacePrefs } from "@/lib/client/api-types";

interface SettingsPanelProps {
  onVerifyIntegrity: () => void;
  isVerifyingIntegrity?: boolean;
}

export function SettingsPanel({
  onVerifyIntegrity,
  isVerifyingIntegrity = false,
}: SettingsPanelProps) {
  const { user, prefs, updatePrefs, signOut } = useAuth();

  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <div>
        <h1 className="text-xl font-bold text-foreground">Examiner Settings &amp; Integrity</h1>
        <p className="text-sm text-ink-subtle">
          Manage your accessibility display preferences, verify tamper-evident exam ledgers, and manage your session.
        </p>
      </div>

      {/* Cryptographic Integrity & Governance Tools */}
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="rounded-2xl border border-border bg-surface p-5 shadow-2xs">
          <div className="flex items-center gap-2.5">
            <ShieldCheck className="h-5 w-5 text-emerald-600" />
            <h2 className="text-sm font-bold text-foreground">
              Tamper-Evident Records Audit
            </h2>
          </div>
          <p className="mt-1.5 text-xs text-ink-subtle">
            Recompute SHA-256 hash chains across every answer, telemetry event, lock event, and exam checkpoint signature on your exams.
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <Button
              disabled={isVerifyingIntegrity}
              onClick={onVerifyIntegrity}
            >
              {isVerifyingIntegrity ? <Spinner /> : "Verify All Records Now"}
            </Button>
            <Link href="/verify">
              <Button variant="secondary">Public Verifier</Button>
            </Link>
          </div>
        </div>

        <div className="rounded-2xl border border-border bg-surface p-5 shadow-2xs">
          <div className="flex items-center gap-2.5">
            <AlertTriangle className="h-5 w-5 text-amber-600" />
            <h2 className="text-sm font-bold text-foreground">
              Disputes &amp; Fairness Resolution
            </h2>
          </div>
          <p className="mt-1.5 text-xs text-ink-subtle">
            Inspect candidate evidence timelines, handle ambiguity appeals (which fairly re-score all candidates), and resolve technical incidents.
          </p>
          <div className="mt-4">
            <Link href="/disputes">
              <Button variant="secondary">Open Disputes Queue</Button>
            </Link>
          </div>
        </div>
      </div>

      {/* Display Preferences (persisted via /api/me/prefs) */}
      <div className="rounded-2xl border border-border bg-surface p-5 shadow-2xs">
        <div className="flex items-center gap-2">
          <SlidersHorizontal className="h-4.5 w-4.5 text-accent" />
          <h2 className="text-sm font-bold text-foreground">Workspace Display Preferences</h2>
        </div>
        <p className="mt-1 text-xs text-ink-subtle">
          Saved directly to your account via <code className="font-mono">/api/me/prefs</code>.
        </p>

        <div className="mt-4 grid gap-4 sm:grid-cols-3">
          <div>
            <Label htmlFor="ex-pref-font">Font Size</Label>
            <Select
              id="ex-pref-font"
              value={prefs.fontSize}
              onChange={(e) => {
                void updatePrefs({
                  fontSize: e.target.value as WorkspacePrefs["fontSize"],
                });
                toast.success("Font preference saved");
              }}
            >
              <option value="sm">Small</option>
              <option value="md">Medium (Default)</option>
              <option value="lg">Large</option>
              <option value="xl">Extra Large</option>
            </Select>
          </div>

          <div>
            <Label htmlFor="ex-pref-theme">Theme</Label>
            <Select
              id="ex-pref-theme"
              value={prefs.theme}
              onChange={(e) => {
                void updatePrefs({
                  theme: e.target.value as WorkspacePrefs["theme"],
                });
                toast.success("Theme preference saved");
              }}
            >
              <option value="light">Light</option>
              <option value="dark">Dark</option>
              <option value="system">System</option>
            </Select>
          </div>

          <div className="flex items-end pb-2">
            <label className="inline-flex cursor-pointer items-center gap-2 text-sm text-ink-muted">
              <input
                type="checkbox"
                checked={Boolean(prefs.highContrast)}
                onChange={(e) => {
                  void updatePrefs({ highContrast: e.target.checked });
                  toast.success("Contrast preference saved");
                }}
                className="h-4 w-4 rounded accent-[#1b4d3e]"
              />
              High Contrast Mode
            </label>
          </div>
        </div>
      </div>

      {/* Account Session */}
      {user && (
        <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-border bg-surface p-5 shadow-2xs">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-full bg-[#e6f1ec] text-accent">
              <UserCheck className="h-5 w-5" />
            </span>
            <div>
              <div className="flex items-center gap-2">
                <p className="text-sm font-bold text-foreground">{user.name}</p>
                <Badge tone="accent">{user.role}</Badge>
              </div>
              <p className="text-xs text-ink-subtle">{user.email}</p>
            </div>
          </div>

          <Button variant="danger" size="sm" onClick={() => void signOut()}>
            <LogOut className="h-4 w-4" /> Sign Out
          </Button>
        </div>
      )}
    </div>
  );
}
