"use client";

import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  BookOpen,
  CalendarDays,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Contrast,
  FileBadge2,
  FileWarning,
  LayoutGrid,
  LogOut,
  Menu,
  Moon,
  PlusSquare,
  ShieldCheck,
  SlidersHorizontal,
  Sun,
  User,
  Users,
  X,
} from "lucide-react";
import { useAuth, roleHomePath } from "@/hooks/use-auth";
import type { UserRole, WorkspacePrefs } from "@/lib/client/api-types";
import { Badge, BrandMark, Button, cn, Skeleton, ThemeToggleButton } from "./ui/primitives";

interface NavItem {
  href: string;
  label: string;
  icon: ReactNode;
  group: string;
}

function getNavForRole(role: UserRole): NavItem[] {
  const iconCls = "h-4 w-4 shrink-0";
  if (role === "ADMIN") {
    return [
      { href: "/admin", label: "Users & Roles", icon: <Users className={iconCls} strokeWidth={1.7} />, group: "MAIN" },
      { href: "/profile", label: "My Profile", icon: <User className={iconCls} strokeWidth={1.7} />, group: "MAIN" },
      { href: "/examiner", label: "Examinations", icon: <LayoutGrid className={iconCls} strokeWidth={1.7} />, group: "ACADEMICS" },
      { href: "/examiner/exams/new", label: "Create Exam", icon: <PlusSquare className={iconCls} strokeWidth={1.7} />, group: "ACADEMICS" },
      { href: "/examiner/questions", label: "Question Bank", icon: <BookOpen className={iconCls} strokeWidth={1.7} />, group: "ACADEMICS" },
      { href: "/disputes", label: "Disputes", icon: <FileWarning className={iconCls} strokeWidth={1.7} />, group: "REPORTS & AUDIT" },
      { href: "/verify", label: "Public Verify", icon: <ShieldCheck className={iconCls} strokeWidth={1.7} />, group: "REPORTS & AUDIT" },
    ];
  }
  if (role === "EXAMINER") {
    return [
      { href: "/examiner", label: "Dashboard", icon: <LayoutGrid className={iconCls} strokeWidth={1.7} />, group: "MAIN" },
      { href: "/profile", label: "My Profile", icon: <User className={iconCls} strokeWidth={1.7} />, group: "MAIN" },
      { href: "/examiner/exams/new", label: "Create Exam", icon: <PlusSquare className={iconCls} strokeWidth={1.7} />, group: "ACADEMICS" },
      { href: "/examiner/questions", label: "Question Bank", icon: <BookOpen className={iconCls} strokeWidth={1.7} />, group: "ACADEMICS" },
      { href: "/disputes", label: "Disputes", icon: <FileWarning className={iconCls} strokeWidth={1.7} />, group: "REPORTS & AUDIT" },
      { href: "/verify", label: "Public Verify", icon: <ShieldCheck className={iconCls} strokeWidth={1.7} />, group: "REPORTS & AUDIT" },
    ];
  }
  return [
    { href: "/candidate", label: "Dashboard", icon: <LayoutGrid className={iconCls} strokeWidth={1.7} />, group: "MAIN" },
    { href: "/profile", label: "My Profile", icon: <User className={iconCls} strokeWidth={1.7} />, group: "MAIN" },
    { href: "/candidate/datesheet", label: "My Datesheet", icon: <CalendarDays className={iconCls} strokeWidth={1.7} />, group: "ACADEMICS" },
    { href: "/candidate/admit-card", label: "Admit Card", icon: <FileBadge2 className={iconCls} strokeWidth={1.7} />, group: "ACADEMICS" },
    { href: "/disputes", label: "My Disputes", icon: <FileWarning className={iconCls} strokeWidth={1.7} />, group: "REPORTS" },
    { href: "/verify", label: "Public Verify", icon: <ShieldCheck className={iconCls} strokeWidth={1.7} />, group: "REPORTS" },
  ];
}

export function WorkspacePrefsMenu() {
  const { prefs, updatePrefs } = useAuth();
  const [open, setOpen] = useState(false);
  const fontSizes: WorkspacePrefs["fontSize"][] = ["sm", "md", "lg", "xl"];

  return (
    <div className="relative">
      <button
        type="button"
        aria-label="Display preferences"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="flex h-9 w-9 items-center justify-center rounded-[2px] border border-border bg-surface text-ink-muted hover:bg-surface-muted hover:text-foreground transition-colors cursor-pointer"
        title="Display & Accessibility Preferences"
      >
        <SlidersHorizontal className="h-4 w-4" strokeWidth={1.7} />
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-11 z-40 w-72 rounded-[2px] border border-border bg-surface p-4 surface-elevated animate-fade-rise">
            <div className="mb-3 flex items-center justify-between border-b border-border pb-2">
              <span className="text-[11px] font-semibold uppercase tracking-[0.06em] text-ink-muted">
                Display Preferences
              </span>
              <button
                type="button"
                className="text-xs text-ink-subtle hover:text-foreground cursor-pointer"
                onClick={() => setOpen(false)}
              >
                Close
              </button>
            </div>

            <div className="space-y-3.5 text-sm">
              <div>
                <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-[0.05em] text-ink-subtle">
                  Theme
                </p>
                <div className="grid grid-cols-3 gap-1.5">
                  {(["light", "dark", "system"] as const).map((t) => (
                    <button
                      key={t}
                      type="button"
                      onClick={() => updatePrefs({ theme: t })}
                      className={cn(
                        "flex h-9 items-center justify-center gap-1 rounded-[2px] border px-2 text-xs font-medium capitalize cursor-pointer transition-colors",
                        prefs.theme === t
                          ? "border-accent bg-accent-soft text-foreground font-semibold"
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
                <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-[0.05em] text-ink-subtle">
                  Font Size
                </p>
                <div className="grid grid-cols-4 gap-1.5">
                  {fontSizes.map((sz) => (
                    <button
                      key={sz}
                      type="button"
                      onClick={() => updatePrefs({ fontSize: sz })}
                      className={cn(
                        "h-8 rounded-[2px] border text-xs font-semibold uppercase cursor-pointer transition-colors",
                        prefs.fontSize === sz
                          ? "border-accent bg-accent-soft text-foreground"
                          : "border-border bg-surface text-ink-muted hover:bg-surface-muted"
                      )}
                    >
                      {sz}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex items-center justify-between border-t border-border pt-3">
                <span className="flex items-center gap-1.5 text-xs font-medium text-foreground">
                  <Contrast className="h-3.5 w-3.5 text-ink-muted" />
                  High Contrast
                </span>
                <button
                  type="button"
                  role="switch"
                  aria-checked={prefs.highContrast}
                  onClick={() => updatePrefs({ highContrast: !prefs.highContrast })}
                  className={cn(
                    "h-5 w-9 rounded-full p-0.5 cursor-pointer transition-colors",
                    prefs.highContrast ? "bg-accent" : "bg-border-strong"
                  )}
                >
                  <span
                    className={cn(
                      "block h-4 w-4 rounded-full bg-surface transition-transform",
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
  hideTitleHeader = false,
  children,
}: {
  allowedRoles?: UserRole[];
  title?: string;
  subtitle?: string;
  actions?: ReactNode;
  hideTitleHeader?: boolean;
  children: ReactNode;
}) {
  const { user, loading, error, signOut } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);

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
      <div className="flex min-h-screen bg-background">
        <aside className="hidden lg:flex w-56 shrink-0 flex-col portal-chrome p-4 gap-4 border-r border-[var(--portal-chrome-border)]">
          <div className="h-9 w-36 rounded-[2px] bg-[#f5f8f6]/15" />
          <div className="space-y-2 pt-4">
            <div className="h-9 w-full rounded-[2px] bg-[#f5f8f6]/12" />
            <div className="h-9 w-full rounded-[2px] bg-[#f5f8f6]/12" />
            <div className="h-9 w-full rounded-[2px] bg-[#f5f8f6]/12" />
          </div>
        </aside>
        <div className="flex-1 p-6 space-y-5">
          <Skeleton className="h-36 w-full" />
          <div className="grid gap-4 sm:grid-cols-4">
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-24 w-full" />
          </div>
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
  const groups = Array.from(new Set(navItems.map((n) => n.group)));
  const firstName = (user.name || "User").split(/\s+/)[0].toUpperCase();
  const initial = (user.name || "U").charAt(0).toUpperCase();
  const portalLabel =
    user.role === "ADMIN"
      ? "ADMIN PORTAL"
      : user.role === "EXAMINER"
      ? "EXAMINER PORTAL"
      : "STUDENT PORTAL";
  const roleSubLabel =
    user.role === "ADMIN" ? "ADMIN" : user.role === "EXAMINER" ? "EXAMINER" : "STUDENT";

  const isActivePath = (href: string) => {
    if (href === "/candidate" || href === "/examiner" || href === "/admin") {
      return pathname === href;
    }
    return pathname === href || pathname?.startsWith(`${href}/`);
  };

  const renderSidebarNav = (isCompact: boolean, onNavigate?: () => void) => (
    <div className="flex-1 overflow-y-auto py-4 space-y-5">
      {groups.map((grp) => (
        <div key={grp}>
          {!isCompact && (
            <p className="px-4 mb-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-[#f5f8f6]/50">
              {grp}
            </p>
          )}
          <ul className="space-y-0.5">
            {navItems
              .filter((item) => item.group === grp)
              .map((item) => {
                const active = isActivePath(item.href);
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      onClick={onNavigate}
                      title={isCompact ? item.label : undefined}
                      aria-current={active ? "page" : undefined}
                      className={cn(
                        "flex h-10 items-center gap-3 px-4 text-[13.5px] font-medium transition-[background-color,color,border-color] duration-150",
                        isCompact && "justify-center px-0",
                        active
                          ? "border-l-[3px] border-[#6ee7b7] bg-[#f5f8f6]/[0.1] text-[#6ee7b7]"
                          : "border-l-[3px] border-transparent text-[#f5f8f6]/75 hover:bg-[#f5f8f6]/[0.05] hover:text-[#f5f8f6]"
                      )}
                    >
                      {item.icon}
                      {!isCompact && <span className="truncate">{item.label}</span>}
                    </Link>
                  </li>
                );
              })}
          </ul>
        </div>
      ))}
    </div>
  );

  return (
    <div className="flex min-h-screen bg-background text-foreground">
      <a href="#main-content" className="skip-link">
        Skip to main content
      </a>

      {/* Desktop Collapsible Heritage Espresso Sidebar */}
      <aside
        className={cn(
          "hidden lg:flex shrink-0 flex-col portal-chrome border-r border-[var(--portal-chrome-border)] sticky top-0 h-screen transition-[width] duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] no-print",
          collapsed ? "w-[68px]" : "w-56"
        )}
      >
        <div className="flex h-[57px] items-center justify-between px-3.5 border-b border-[var(--portal-chrome-border)]">
          <Link
            href={roleHomePath(user.role)}
            className="flex items-center gap-2.5 min-w-0"
          >
            <BrandMark className="h-8 w-8" />
            {!collapsed && (
              <div className="leading-tight">
                <p className="text-[10px] font-medium uppercase tracking-[0.14em] text-[#f5f8f6]/60">
                  {roleSubLabel}
                </p>
              </div>
            )}
          </Link>

          <button
            type="button"
            onClick={() => setCollapsed((c) => !c)}
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            className="flex h-7 w-7 items-center justify-center rounded-[2px] text-[#f5f8f6]/65 hover:bg-[#f5f8f6]/10 hover:text-[#f5f8f6] transition-colors cursor-pointer"
          >
            {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
          </button>
        </div>

        <nav aria-label="Sidebar navigation" className="flex flex-1 flex-col min-h-0">
          {renderSidebarNav(collapsed)}
        </nav>

        {/* Bottom Profile Box */}
        <div className="border-t border-[var(--portal-chrome-border)] p-3">
          <Link
            href="/profile"
            className={cn(
              "flex items-center gap-2.5 rounded-[2px] border border-[#f5f8f6]/15 bg-[#f5f8f6]/[0.05] p-2.5 hover:bg-[#f5f8f6]/[0.1] transition-colors",
              collapsed && "justify-center p-2"
            )}
          >
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#6ee7b7] font-display text-xs font-bold text-[#0b2922]">
              {initial}
            </span>
            {!collapsed && (
              <div className="min-w-0 leading-tight">
                <p className="truncate text-xs font-semibold uppercase tracking-wide text-[#f5f8f6]">
                  {user.name}
                </p>
                <p className="truncate text-[11px] text-[#f5f8f6]/60">{user.email}</p>
              </div>
            )}
          </Link>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Sticky 57px Top Portal Header */}
        <header className="sticky top-0 z-20 flex h-[57px] items-center justify-between gap-4 border-b border-border bg-surface px-4 sm:px-6 shadow-xs no-print">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              aria-label="Open navigation menu"
              onClick={() => setDrawerOpen(true)}
              className="flex h-9 w-9 items-center justify-center rounded-[2px] border border-border bg-surface text-foreground lg:hidden cursor-pointer"
            >
              <Menu className="h-5 w-5" />
            </button>

            <span className="font-display text-base font-bold uppercase tracking-[0.03em] text-foreground truncate">
              {portalLabel}
            </span>
          </div>

          <div className="flex items-center gap-2.5">
            <ThemeToggleButton showLabel />
            <WorkspacePrefsMenu />

            {/* User Menu Dropdown */}
            <div className="relative">
              <button
                type="button"
                onClick={() => setUserMenuOpen((o) => !o)}
                className="flex items-center gap-2.5 rounded-[2px] px-1.5 py-1 hover:bg-surface-muted transition-colors cursor-pointer"
              >
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-accent font-display text-xs font-bold text-accent-ink">
                  {initial}
                </span>
                <span className="hidden sm:inline text-xs font-semibold uppercase tracking-[0.04em] text-foreground">
                  {firstName}
                </span>
                <ChevronDown className="h-3.5 w-3.5 text-ink-subtle" />
              </button>

              {userMenuOpen && (
                <>
                  <div className="fixed inset-0 z-30" onClick={() => setUserMenuOpen(false)} />
                  <div className="absolute right-0 top-11 z-40 w-56 rounded-[2px] border border-border bg-surface py-1.5 surface-elevated animate-fade-rise">
                    <div className="border-b border-border px-3.5 py-2.5">
                      <p className="text-xs font-semibold text-foreground truncate">{user.name}</p>
                      <p className="text-[11px] text-ink-subtle truncate">{user.email}</p>
                    </div>
                    <Link
                      href="/profile"
                      onClick={() => setUserMenuOpen(false)}
                      className="flex items-center gap-2 px-3.5 py-2 text-xs font-medium text-foreground hover:bg-surface-muted"
                    >
                      <User className="h-3.5 w-3.5 text-ink-muted" /> My Profile
                    </Link>
                    <button
                      type="button"
                      onClick={() => {
                        setUserMenuOpen(false);
                        signOut();
                      }}
                      className="flex w-full items-center gap-2 px-3.5 py-2 text-xs font-medium text-danger hover:bg-danger-soft/60 cursor-pointer"
                    >
                      <LogOut className="h-3.5 w-3.5" /> Sign Out
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </header>

        {/* Mobile Drawer */}
        {drawerOpen && (
          <div className="fixed inset-0 z-50 flex lg:hidden">
            <div
              className="fixed inset-0 bg-black/50 backdrop-blur-xs"
              onClick={() => setDrawerOpen(false)}
            />
            <aside className="relative z-10 flex w-64 max-w-[82vw] flex-col portal-chrome border-r border-[var(--portal-chrome-border)] surface-elevated animate-fade-rise">
              <div className="flex h-[57px] items-center justify-between px-4 border-b border-[var(--portal-chrome-border)]">
                <Link
                  href={roleHomePath(user.role)}
                  onClick={() => setDrawerOpen(false)}
                  className="flex items-center gap-2.5"
                >
                  <BrandMark className="h-8 w-8" />
                  <div className="leading-tight">
                    <p className="text-[10px] uppercase tracking-[0.14em] text-[#f5f8f6]/60">
                      {roleSubLabel}
                    </p>
                  </div>
                </Link>
                <button
                  type="button"
                  aria-label="Close navigation menu"
                  onClick={() => setDrawerOpen(false)}
                  className="flex h-8 w-8 items-center justify-center text-[#f5f8f6]/75 hover:text-[#f5f8f6] cursor-pointer"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              {renderSidebarNav(false, () => setDrawerOpen(false))}

              <div className="border-t border-[var(--portal-chrome-border)] p-3">
                <button
                  type="button"
                  onClick={() => {
                    setDrawerOpen(false);
                    signOut();
                  }}
                  className="flex w-full items-center justify-center gap-2 rounded-[2px] border border-[#f5f8f6]/20 bg-[#f5f8f6]/10 px-3 py-2 text-xs font-medium text-[#f5f8f6] hover:bg-[#f5f8f6]/15 cursor-pointer"
                >
                  <LogOut className="h-3.5 w-3.5" /> Sign Out
                </button>
              </div>
            </aside>
          </div>
        )}

        <main
          id="main-content"
          className="mx-auto w-full max-w-[1360px] flex-1 px-4 py-6 sm:px-6 lg:px-8"
        >
          {!hideTitleHeader && (title || actions) && (
            <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
              <div className="min-w-0">
                {title && (
                  <h1 className="font-display text-xl sm:text-2xl font-bold uppercase tracking-[0.02em] text-foreground">
                    {title}
                  </h1>
                )}
                {subtitle && (
                  <p className="mt-1 text-sm text-ink-muted max-w-2xl">{subtitle}</p>
                )}
              </div>
              {actions && (
                <div className="flex flex-wrap items-center gap-2 shrink-0">{actions}</div>
              )}
            </div>
          )}
          {children}
        </main>
      </div>
    </div>
  );
}
