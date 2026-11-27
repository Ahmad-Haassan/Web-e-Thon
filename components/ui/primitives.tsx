"use client";

import type {
  ButtonHTMLAttributes,
  HTMLAttributes,
  InputHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
  TextareaHTMLAttributes,
} from "react";
import { Moon, Sun } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";

export function cn(...classes: Array<string | false | null | undefined>): string {
  return classes.filter(Boolean).join(" ");
}

/** Circular institutional NIIT EMS crest mark harmonized with #f5f8f6 / #113b32 palette. */
export function BrandMark({
  className,
  variant = "crest",
}: {
  className?: string;
  variant?: "crest" | "square";
}) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "inline-flex h-9 w-9 shrink-0 items-center justify-center border border-[#6ee7b7]/45 bg-[#0b2922] text-[#6ee7b7]",
        variant === "crest" ? "rounded-full" : "rounded-[2px]",
        className
      )}
    >
      <svg
        viewBox="0 0 24 24"
        fill="none"
        className="h-5 w-5"
        xmlns="http://www.w3.org/2000/svg"
      >
        <circle cx="12" cy="12" r="9.5" stroke="currentColor" strokeWidth="1.4" strokeOpacity="0.45" />
        <path
          d="M12 4.5L18 7V11.8C18 15.6 15.45 18.65 12 19.8C8.55 18.65 6 15.6 6 11.8V7L12 4.5Z"
          stroke="#f5f8f6"
          strokeWidth="1.5"
          strokeLinejoin="round"
        />
        <path
          d="M9.2 12.1L11.1 14L15 9.9"
          stroke="#6ee7b7"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </span>
  );
}

/** One-click Light (#f5f8f6) <-> Dark (#113b32) theme toggle button usable anywhere. */
export function ThemeToggleButton({
  className,
  showLabel = false,
}: {
  className?: string;
  showLabel?: boolean;
}) {
  const { prefs, updatePrefs } = useAuth();
  const isDark = prefs.theme === "dark";

  return (
    <button
      type="button"
      onClick={() => updatePrefs({ theme: isDark ? "light" : "dark" })}
      aria-label={isDark ? "Switch to light theme" : "Switch to dark theme"}
      title={isDark ? "Switch to Light Mode (#f5f8f6)" : "Switch to Dark Mode (#113b32)"}
      className={cn(
        "inline-flex h-9 items-center justify-center gap-1.5 rounded-[2px] border border-border bg-surface px-2.5 text-xs font-medium text-foreground hover:bg-surface-muted transition-colors cursor-pointer",
        className
      )}
    >
      {isDark ? (
        <Sun className="h-4 w-4 text-accent" strokeWidth={1.7} />
      ) : (
        <Moon className="h-4 w-4 text-ink-muted" strokeWidth={1.7} />
      )}
      {showLabel && <span>{isDark ? "Light" : "Dark"}</span>}
    </button>
  );
}

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger" | "verified";
type ButtonSize = "sm" | "md" | "lg";

export function Button({
  variant = "primary",
  size = "md",
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
}) {
  const variants: Record<ButtonVariant, string> = {
    primary:
      "bg-accent text-accent-ink hover:bg-accent-hover border border-transparent shadow-xs",
    secondary:
      "bg-surface text-foreground border border-border hover:bg-surface-muted hover:border-border-strong",
    ghost:
      "bg-transparent text-ink-muted border border-transparent hover:bg-surface-muted hover:text-foreground",
    danger:
      "bg-danger text-white hover:opacity-90 border border-transparent",
    verified:
      "bg-verified text-white hover:opacity-90 border border-transparent",
  };
  const sizes: Record<ButtonSize, string> = {
    sm: "h-9 px-3 text-xs gap-1.5",
    md: "h-10 px-4 text-sm gap-2",
    lg: "h-11 px-5 text-sm gap-2",
  };

  return (
    <button
      {...props}
      className={cn(
        "inline-flex items-center justify-center rounded-[2px] font-medium select-none cursor-pointer",
        "transition-[background-color,border-color,color,transform,opacity] duration-150 ease-[cubic-bezier(0.22,1,0.36,1)]",
        "active:scale-[0.98] disabled:opacity-45 disabled:cursor-not-allowed disabled:active:scale-100",
        variants[variant],
        sizes[size],
        className
      )}
    />
  );
}

export function Card({
  className,
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      {...props}
      className={cn(
        "rounded-[2px] border border-border bg-surface text-foreground surface-card",
        className
      )}
    />
  );
}

export function CardHeader({
  className,
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      {...props}
      className={cn("flex flex-col gap-1 border-b border-border px-5 py-4", className)}
    />
  );
}

export function CardContent({
  className,
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return <div {...props} className={cn("p-5", className)} />;
}

type BadgeTone = "neutral" | "accent" | "verified" | "warning" | "danger";

export function Badge({
  tone = "neutral",
  pill = true,
  className,
  children,
}: {
  tone?: BadgeTone;
  pill?: boolean;
  className?: string;
  children: ReactNode;
}) {
  const tones: Record<BadgeTone, string> = {
    neutral: "bg-surface-muted text-ink-muted border-border",
    accent: "bg-accent-soft text-accent border-accent/25",
    verified: "bg-verified-soft text-verified border-verified/25",
    warning: "bg-warning-soft text-warning border-warning/25",
    danger: "bg-danger-soft text-danger border-danger/25",
  };
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 border px-2.5 py-0.5 text-xs font-medium leading-4 tabular-nums",
        pill ? "rounded-full" : "rounded-[2px]",
        tones[tone],
        className
      )}
    >
      {children}
    </span>
  );
}

export function Input({
  className,
  ...props
}: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={cn(
        "h-11 w-full rounded-[2px] border border-border bg-surface px-3.5 text-base sm:text-sm text-foreground placeholder:text-ink-subtle",
        "transition-[border-color,background-color] duration-150 ease-[cubic-bezier(0.22,1,0.36,1)]",
        "hover:border-border-strong focus:border-accent disabled:opacity-50 disabled:bg-surface-subtle",
        className
      )}
    />
  );
}

export function Textarea({
  className,
  ...props
}: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      {...props}
      className={cn(
        "w-full rounded-[2px] border border-border bg-surface p-3.5 text-base sm:text-sm text-foreground placeholder:text-ink-subtle",
        "transition-[border-color,background-color] duration-150 ease-[cubic-bezier(0.22,1,0.36,1)]",
        "hover:border-border-strong focus:border-accent disabled:opacity-50 disabled:bg-surface-subtle",
        className
      )}
    />
  );
}

export function Select({
  className,
  ...props
}: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      {...props}
      className={cn(
        "h-10 w-full rounded-[2px] border border-border bg-surface px-3 text-base sm:text-sm text-foreground",
        "transition-[border-color,background-color] duration-150 ease-[cubic-bezier(0.22,1,0.36,1)]",
        "hover:border-border-strong focus:border-accent disabled:opacity-50 disabled:bg-surface-subtle",
        className
      )}
    />
  );
}

export function Label({
  className,
  children,
  htmlFor,
}: {
  className?: string;
  children: ReactNode;
  htmlFor?: string;
}) {
  return (
    <label
      htmlFor={htmlFor}
      className={cn(
        "block text-[11px] font-semibold uppercase tracking-[0.06em] text-ink-muted mb-1.5",
        className
      )}
    >
      {children}
    </label>
  );
}

export function StatCard({
  label,
  value,
  meta,
  tone = "default",
}: {
  label: string;
  value: string | number;
  meta?: string;
  tone?: "default" | "accent" | "verified" | "warning";
}) {
  const valueTone =
    tone === "accent"
      ? "text-accent"
      : tone === "verified"
      ? "text-verified"
      : tone === "warning"
      ? "text-warning"
      : "text-foreground";
  return (
    <div className="rounded-[2px] border border-border bg-surface px-5 py-4 surface-card">
      <p className="text-[11px] font-semibold uppercase tracking-[0.06em] text-ink-subtle">
        {label}
      </p>
      <p className={cn("mt-2 text-2xl font-bold font-display tabular-nums", valueTone)}>
        {value}
      </p>
      {meta && <p className="mt-1 text-xs text-ink-subtle">{meta}</p>}
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden="true" className={cn("skeleton-bar rounded-[2px]", className)} />;
}

export function EmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon?: ReactNode;
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-[2px] border border-dashed border-border-strong bg-surface-subtle px-6 py-12 text-center">
      {icon && <div className="mb-3 text-ink-subtle">{icon}</div>}
      <h3 className="text-base font-semibold text-foreground">{title}</h3>
      <p className="mt-1 max-w-md text-sm text-ink-muted">{description}</p>
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function Spinner({ className }: { className?: string }) {
  return (
    <span
      aria-label="Loading"
      className={cn(
        "inline-block h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent",
        className
      )}
    />
  );
}
