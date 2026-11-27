"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useMutation } from "@tanstack/react-query";
import {
  BadgeCheck,
  GraduationCap,
  Mail,
  Phone,
  Save,
  ShieldAlert,
  User as UserIcon,
} from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/app-shell";
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  Input,
  Label,
  Select,
  Spinner,
} from "@/components/ui/primitives";
import { useAuth } from "@/hooks/use-auth";
import { api } from "@/lib/client/api";

const COMMON_CLASSES = ["IX", "X", "XI", "XII", "BSCS-1", "BSCS-2", "BSCS-3", "BSCS-4", "BSSE-4"];
const COMMON_SECTIONS = ["A", "B", "C", "D"];

export default function ProfilePage() {
  const { user, refreshUser } = useAuth();

  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [className, setClassName] = useState("");
  const [section, setSection] = useState("");

  useEffect(() => {
    if (!user) return;
    setName(user.name ?? "");
    setPhone(user.phone ?? "");
    setClassName(user.class_name ?? "");
    setSection(user.section ?? "");
  }, [user]);

  const saveMut = useMutation({
    mutationFn: () =>
      api.me.updateProfile({
        name: name.trim(),
        phone: phone.trim() || null,
        className: className.trim() || null,
        section: section.trim() || null,
      }),
    onSuccess: async () => {
      await refreshUser();
      toast.success("Profile updated successfully");
    },
    onError: (err: Error) => toast.error(err.message),
  });

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (name.trim().length < 2) {
      toast.error("Name must be at least 2 characters");
      return;
    }
    saveMut.mutate();
  }

  const initials = (user?.name ?? "U")
    .split(/\s+/)
    .map((p) => p[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);

  return (
    <AppShell
      title="My Profile"
      subtitle="Review your institutional record and manage your academic class, section, and contact number."
    >
      <div className="mx-auto max-w-3xl space-y-6">
        {/* Identity Banner */}
        <section className="portal-chrome rounded-sm border border-[#6ee7b7]/25 p-5 sm:p-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
            <div className="relative flex h-16 w-16 shrink-0 items-center justify-center rounded-full border-2 border-[#6ee7b7] bg-[#f5f8f6]/15 font-display text-xl font-bold text-[#f5f8f6]">
              {initials}
              <span
                title={user?.email_verified ? "Email Verified" : "Email Pending Verification"}
                className={`absolute -bottom-0.5 -right-0.5 flex h-6 w-6 items-center justify-center rounded-full border-2 border-[#0b2922] ${
                  user?.email_verified
                    ? "bg-verified text-white"
                    : "bg-warning text-white"
                }`}
              >
                {user?.email_verified ? (
                  <BadgeCheck className="h-3.5 w-3.5" />
                ) : (
                  <ShieldAlert className="h-3.5 w-3.5" />
                )}
              </span>
            </div>

            <div className="min-w-0 flex-1 space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="font-display text-xl font-bold uppercase tracking-wide text-[#f5f8f6] truncate">
                  {user?.name ?? "Loading…"}
                </h2>
                <span className="rounded-full border border-[#6ee7b7]/40 bg-[#6ee7b7]/15 px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-[0.06em] text-[#6ee7b7]">
                  {user?.role}
                </span>
              </div>
              <p className="font-mono text-xs text-[#f5f8f6]/80 truncate">{user?.email}</p>
            </div>
          </div>
        </section>

        {/* Academic & Identity Definition Grid */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between gap-2">
              <h3 className="font-display text-sm font-semibold uppercase tracking-[0.05em] text-foreground">
                Academic &amp; Account Summary
              </h3>
              <Badge tone={user?.email_verified ? "verified" : "warning"}>
                {user?.email_verified ? "Verified Account" : "Verification Pending"}
              </Badge>
            </div>
          </CardHeader>
          <CardContent>
            <dl className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <div className="rounded-sm border border-border bg-surface-subtle p-3">
                <dt className="text-[10px] font-semibold uppercase tracking-[0.08em] text-ink-subtle">
                  Full Name
                </dt>
                <dd className="mt-1 text-sm font-medium text-foreground">
                  {user?.name || "—"}
                </dd>
              </div>
              <div className="rounded-sm border border-border bg-surface-subtle p-3">
                <dt className="text-[10px] font-semibold uppercase tracking-[0.08em] text-ink-subtle">
                  University Email
                </dt>
                <dd className="mt-1 truncate font-mono text-xs font-medium text-foreground">
                  {user?.email || "—"}
                </dd>
              </div>
              <div className="rounded-sm border border-border bg-surface-subtle p-3">
                <dt className="text-[10px] font-semibold uppercase tracking-[0.08em] text-ink-subtle">
                  Portal Role
                </dt>
                <dd className="mt-1 font-mono text-xs font-semibold text-accent">
                  {user?.role || "—"}
                </dd>
              </div>
              <div className="rounded-sm border border-border bg-surface-subtle p-3">
                <dt className="text-[10px] font-semibold uppercase tracking-[0.08em] text-ink-subtle">
                  Class / Cohort
                </dt>
                <dd className="mt-1 font-mono text-sm font-medium text-foreground">
                  {user?.class_name || "Not assigned"}
                </dd>
              </div>
              <div className="rounded-sm border border-border bg-surface-subtle p-3">
                <dt className="text-[10px] font-semibold uppercase tracking-[0.08em] text-ink-subtle">
                  Section
                </dt>
                <dd className="mt-1 font-mono text-sm font-medium text-foreground">
                  {user?.section ? `Section ${user.section}` : "General"}
                </dd>
              </div>
              <div className="rounded-sm border border-border bg-surface-subtle p-3">
                <dt className="text-[10px] font-semibold uppercase tracking-[0.08em] text-ink-subtle">
                  Contact Number
                </dt>
                <dd className="mt-1 font-mono text-xs font-medium text-foreground">
                  {user?.phone || "Not provided"}
                </dd>
              </div>
            </dl>
          </CardContent>
        </Card>

        {/* Editable Profile Card */}
        <Card>
          <CardHeader>
            <h3 className="font-display text-sm font-semibold uppercase tracking-[0.05em] text-foreground">
              Update Personal &amp; Academic Details
            </h3>
            <p className="mt-0.5 text-xs text-ink-muted">
              Keep your class and section accurate so examiners can automatically include you in scheduled cohort exams.
            </p>
          </CardHeader>

          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <Label htmlFor="prof-name">
                    <span className="inline-flex items-center gap-1.5">
                      <UserIcon className="h-3.5 w-3.5 text-ink-subtle" /> Full Name
                    </span>
                  </Label>
                  <Input
                    id="prof-name"
                    required
                    minLength={2}
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Ayesha Khan"
                  />
                </div>

                <div>
                  <Label htmlFor="prof-email">
                    <span className="inline-flex items-center gap-1.5">
                      <Mail className="h-3.5 w-3.5 text-ink-subtle" /> University Email
                    </span>
                  </Label>
                  <Input
                    id="prof-email"
                    value={user?.email ?? ""}
                    readOnly
                    disabled
                    className="font-mono opacity-75"
                  />
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-3">
                <div>
                  <Label htmlFor="prof-phone">
                    <span className="inline-flex items-center gap-1.5">
                      <Phone className="h-3.5 w-3.5 text-ink-subtle" /> Phone Number
                    </span>
                  </Label>
                  <Input
                    id="prof-phone"
                    type="tel"
                    placeholder="+92 300 1234567"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                  />
                </div>

                <div>
                  <Label htmlFor="prof-class">
                    <span className="inline-flex items-center gap-1.5">
                      <GraduationCap className="h-3.5 w-3.5 text-ink-subtle" /> Class / Cohort
                    </span>
                  </Label>
                  <Input
                    id="prof-class"
                    list="common-classes-list"
                    placeholder="e.g. IX or BSCS-4"
                    value={className}
                    onChange={(e) => setClassName(e.target.value)}
                  />
                  <datalist id="common-classes-list">
                    {COMMON_CLASSES.map((c) => (
                      <option key={c} value={c} />
                    ))}
                  </datalist>
                </div>

                <div>
                  <Label htmlFor="prof-section">Section</Label>
                  <Select
                    id="prof-section"
                    value={COMMON_SECTIONS.includes(section) ? section : section ? "__custom__" : ""}
                    onChange={(e) => {
                      if (e.target.value !== "__custom__") setSection(e.target.value);
                    }}
                  >
                    <option value="">None / General</option>
                    {COMMON_SECTIONS.map((s) => (
                      <option key={s} value={s}>
                        Section {s}
                      </option>
                    ))}
                  </Select>
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
                <p className="text-xs text-ink-subtle">
                  {user?.role === "CANDIDATE"
                    ? "Examiners can auto-enroll you in exams assigned to your Class and Section."
                    : "Role changes are managed by an institution Administrator."}
                </p>
                <Button type="submit" disabled={saveMut.isPending}>
                  {saveMut.isPending ? (
                    <>
                      <Spinner /> Saving…
                    </>
                  ) : (
                    <>
                      <Save className="h-4 w-4" /> Save Profile
                    </>
                  )}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      </div>
    </AppShell>
  );
}
