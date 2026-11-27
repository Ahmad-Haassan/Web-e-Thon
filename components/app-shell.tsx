"use client";

import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  BookOpen,
  ClipboardCheck,
  FileWarning,
  LayoutDashboard,
  LogOut,
  Moon,
  ShieldCheck,
  SlidersHorizontal,
  Sun,
  Users,
  Contrast,
} from "lucide-react";
import { useAuth, roleHomePath } from "@/hooks/use-auth";
import type { UserRole, WorkspacePrefs } from "@/lib/client/api-types";
import { Badge, Button, cn, Spinner } from "./ui/primitives";

interface NavItem {
  href: string;
  label: string;
  icon: ReactNode;
}

function getNavForRole(role: UserRole): NavItem[] {
  if (role === "ADMIN") {
    return [
      { href: "/admin", label: "Users & Roles", icon: <Users className="h-4 w-4" /> },
      { href: "/examiner", label: "Exams", icon: <LayoutDashboard className="h-4 w-4" /> },
      { href: "/examiner/questions", label: "Question Bank", icon: <BookOpen className="h-4 w-4" /> },
      { href: "/disputes", label: "Disputes", icon: <FileWarning className="h-4 w-4" /> },
      { href: "/verify", label: "Verify", icon: <ShieldCheck className="h-4 w-4" /> },
    ];
  }
  if (role === "EXAMINER") {
    return [
      { href: "/examiner", label: "Exams", icon: <LayoutDashboard className="h-4 w-4" /> },
      { href: "/examiner/questions", label: "Question Bank", icon: <BookOpen className="h-4 w-4" /> },
      { href: "/disputes", label: "Disputes", icon: <FileWarning className="h-4 w-4" /> },
      { href: "/verify", label: "Verify", icon: <ShieldCheck className="h-4 w-4" /> },
    ];
  }
  return [
    { href: "/candidate", label: "My Exams", icon: <ClipboardCheck className="h-4 w-4" /> },
    { href: "/disputes", label: "Disputes", icon: <FileWarning className="h-4 w-4" /> },
    { href: "/verify", label: "Verify", icon: <ShieldCheck className="h-4 w-4" /> },
  ];
}

export function WorkspacePrefsMenu() {
  const { prefs, updatePrefs } = useAuth();
  const [open, setOpen] = useState(false);

  const fontSizes: WorkspacePrefs["fontSize"][] = ["sm", "md", "lg", "xl"];

  return (
    <div className="relative">
      <Button
        type="button"
        variant="ghost"
        size="sm"
        aria-label="Workspace preferences"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        <SlidersHorizontal className="h-4 w-4" />
        <span className="hidden sm:inline">Display</span>
      </Button>

      {open && (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-10 z-40 w-72 rounded-xl border border-border bg-surface p-4 shadow-lg">
            <div className="mb-3 flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wide text-ink-muted">
                Workspace Preferences
              </span>
              <button
                type="button"
                className="text-xs text-ink-subtle hover:text-foreground"
                onClick={() => setOpen(false)}
              >
                Close
              </button>
            </div>

            <div className="space-y-3 text-sm">
              <div>
                <p className="mb-1.5 text-xs font-medium text-ink-muted">Theme</p>
                <div className="grid grid-cols-3 gap-1.5">
                  {(["light", "dark", "system"] as const).map((t) => (
                    <button
                      key={t}
                      type="button"
                      onClick={() => updatePrefs({ theme: t })}
                      className={cn(
                        "flex items-center justify-center gap-1 rounded-lg border px-2 py-1.5 text-xs font-medium capitalize",
                        prefs.theme === t
                          ? "border-accent bg-accent-soft text-accent"
                          : "border-border bg-surface text-ink-muted hover:bg-surface-muted"
                      )}
                    >
                      {t === "light" && <Sun className="h-3.5 w-3.5" />}
                      {t === "dark" && <Moon className="h-3.5 w-3.5" />}
                      {t}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <p className="mb-1.5 text-xs font-medium text-ink-muted">Font Size</p>
                <div className="grid grid-cols-4 gap-1.5">
                  {fontSizes.map((sz) => (
                    <button
                      key={sz}
                      type="button"
                      onClick={() => updatePrefs({ fontSize: sz })}
                      className={cn(
                        "rounded-lg border py-1.5 text-xs font-semibold uppercase",
                        prefs.fontSize === sz
                          ? "border-accent bg-accent-soft text-accent"
                          : "border-border bg-surface text-ink-muted hover:bg-surface-muted"
                      )}
                    >
                      {sz}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex items-center justify-between border-t border-border pt-2.5">
                <span className="flex items-center gap-1.5 text-xs font-medium text-foreground">
                  <Contrast className="h-3.5 w-3.5" />
                  High Contrast
                </span>
                <button
                  type="button"
                  role="switch"
                  aria-checked={prefs.highContrast}
                  onClick={() => updatePrefs({ highContrast: !prefs.highContrast })}
                  className={cn(
                    "h-5 w-9 rounded-full transition-colors p-0.5",
                    prefs.highContrast ? "bg-accent" : "bg-border-strong"
                  )}
                >
                  <span
                    className={cn(
                      "block h-4 w-4 rounded-full bg-white transition-transform",
                      prefs.highContrast ? "translate-x-4" : "translate-x-0"
                    )}
                  />
                </button>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

export function AppShell({
  allowedRoles,
  title,
  subtitle,
  actions,
  children,
}: {
  allowedRoles?: UserRole[];
  title?: string;
  subtitle?: string;
  actions?: ReactNode;
  children: ReactNode;
}) {
  const { user, loading, error, signOut } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (loading) return;
    if (!user) {
      router.replace(`/login?next=${encodeURIComponent(pathname || "/")}`);
      return;
    }
    if (allowedRoles && !allowedRoles.includes(user.role)) {
      router.replace(roleHomePath(user.role));
    }
  }, [user, loading, allowedRoles, router, pathname]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="flex items-center gap-3 text-sm text-ink-muted">
          <Spinner className="h-5 w-5 text-accent" />
          Loading your academic workspace…
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-background p-6 text-center">
        <Badge tone="danger">Session Notice</Badge>
        <p className="max-w-md text-sm text-ink-muted">{error}</p>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={() => router.push("/login")}>
            Go to Sign In
          </Button>
          <Button variant="ghost" onClick={signOut}>
            Sign Out
          </Button>
        </div>
      </div>
    );
  }

  if (!user || (allowedRoles && !allowedRoles.includes(user.role))) {
    return null;
  }

  const navItems = getNavForRole(user.role);

  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <a href="#main-content" className="skip-link">
        Skip to main content
      </a>

      <header className="sticky top-0 z-20 border-b border-border bg-surface/95 backdrop-blur-xs no-print">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-4 px-4 sm:px-6">
          <div className="flex items-center gap-6">
            <Link
              href={roleHomePath(user.role)}
              className="flex items-center gap-2.5 font-semibold tracking-tight text-foreground"
            >
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent text-accent-ink">
                <ShieldCheck className="h-4.5 w-4.5" />
              </span>
              <span className="text-base">VeriExam</span>
            </Link>

            <nav aria-label="Primary navigation" className="hidden md:flex items-center gap-1">
              {navItems.map((item) => {
                const active =
                  pathname === item.href ||
                  (item.href !== "/examiner" &&
                    item.href !== "/admin" &&
                    item.href !== "/candidate" &&
                    pathname?.startsWith(item.href));
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={cn(
                      "inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                      active
                        ? "bg-accent-soft text-accent"
                        : "text-ink-muted hover:bg-surface-muted hover:text-foreground"
                    )}
                  >
                    {item.icon}
                    {item.label}
                  </Link>
                );
              })}
            </nav>
          </div>

          <div className="flex items-center gap-2">
            <WorkspacePrefsMenu />

            <div className="hidden sm:flex items-center gap-2 rounded-lg border border-border bg-surface-subtle px-3 py-1.5">
              <div className="text-right leading-tight">
                <p className="text-xs font-semibold text-foreground">{user.name}</p>
                <p className="text-[11px] text-ink-subtle">{user.email}</p>
              </div>
              <Badge
                tone={
                  user.role === "ADMIN"
                    ? "danger"
                    : user.role === "EXAMINER"
                    ? "accent"
                    : "verified"
                }
              >
                {user.role}
              </Badge>
            </div>

            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={signOut}
              aria-label="Sign out"
            >
              <LogOut className="h-4 w-4" />
              <span className="hidden lg:inline">Sign Out</span>
            </Button>
          </div>
        </div>

        {/* Mobile navigation */}
        <nav
          aria-label="Mobile navigation"
          className="flex md:hidden items-center gap-1 overflow-x-auto border-t border-border px-4 py-2"
        >
          {navItems.map((item) => {
            const active = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "inline-flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium",
                  active
                    ? "bg-accent-soft text-accent"
                    : "text-ink-muted hover:bg-surface-muted"
                )}
              >
                {item.icon}
                {item.label}
              </Link>
            );
          })}
        </nav>
      </header>

      <main id="main-content" className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 sm:px-6">
        {(title || actions) && (
          <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              {title && (
                <h1 className="text-2xl font-semibold tracking-tight text-foreground">
                  {title}
                </h1>
              )}
              {subtitle && <p className="mt-1 text-sm text-ink-muted">{subtitle}</p>}
            </div>
            {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
          </div>
        )}
        {children}
      </main>
    </div>
  );
}
