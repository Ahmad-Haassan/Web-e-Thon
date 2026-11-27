"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertCircle, CheckCircle2, ShieldCheck, UserPlus } from "lucide-react";
import { toast } from "sonner";
import { getBrowserSupabase, isSupabaseConfigured } from "@/lib/client/supabase";
import { useAuth, roleHomePath } from "@/hooks/use-auth";
import { Button, Card, CardContent, Input, Label, Spinner } from "@/components/ui/primitives";

export default function RegisterPage() {
  const router = useRouter();
  const { refreshUser } = useAuth();

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [needsEmailConfirm, setNeedsEmailConfirm] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    if (name.trim().length < 2) {
      setError("Please enter your full name (at least 2 characters).");
      return;
    }
    if (password.length < 8) {
      setError("Password must be at least 8 characters long.");
      return;
    }
    if (!isSupabaseConfigured()) {
      setError(
        "Supabase environment variables are missing. Add NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY to .env.local."
      );
      return;
    }

    setSubmitting(true);
    try {
      const supabase = getBrowserSupabase();
      const { data, error: signUpError } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        options: {
          data: { name: name.trim() },
        },
      });

      if (signUpError) {
        setError(signUpError.message);
        setSubmitting(false);
        return;
      }

      if (!data.session) {
        setNeedsEmailConfirm(true);
        setSubmitting(false);
        return;
      }

      const appUser = await refreshUser();
      toast.success("Candidate account created");
      router.replace(appUser ? roleHomePath(appUser.role) : "/candidate");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Registration failed");
      setSubmitting(false);
    }
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background px-4 py-12">
      <div className="w-full max-w-md">
        <div className="mb-6 flex flex-col items-center text-center">
          <Link href="/" className="mb-3 flex h-11 w-11 items-center justify-center rounded-xl bg-accent text-accent-ink shadow-xs">
            <ShieldCheck className="h-6 w-6" />
          </Link>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">
            Candidate Registration
          </h1>
          <p className="mt-1 text-sm text-ink-muted">
            Self-signup creates a Candidate account. Examiners &amp; Admins are provisioned by your institution.
          </p>
        </div>

        <Card>
          <CardContent className="p-6">
            {needsEmailConfirm ? (
              <div className="space-y-4 text-center py-4">
                <CheckCircle2 className="mx-auto h-10 w-10 text-verified" />
                <h2 className="text-lg font-semibold">Check your email</h2>
                <p className="text-sm text-ink-muted">
                  We sent a confirmation link to <strong>{email}</strong>. Once confirmed, sign in to view your enrolled exams.
                </p>
                <Link
                  href="/login"
                  className="inline-flex h-10 items-center justify-center rounded-lg bg-accent px-4 text-sm font-medium text-accent-ink"
                >
                  Back to Sign In
                </Link>
              </div>
            ) : (
              <>
                {error && (
                  <div
                    role="alert"
                    className="mb-4 flex items-start gap-2.5 rounded-lg border border-danger/30 bg-danger-soft p-3 text-sm text-danger"
                  >
                    <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                    <span>{error}</span>
                  </div>
                )}

                <form onSubmit={handleSubmit} className="space-y-4">
                  <div>
                    <Label htmlFor="name">Full Name</Label>
                    <Input
                      id="name"
                      type="text"
                      required
                      minLength={2}
                      placeholder="Ayesha Khan"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                    />
                  </div>

                  <div>
                    <Label htmlFor="email">University Email</Label>
                    <Input
                      id="email"
                      type="email"
                      autoComplete="email"
                      required
                      placeholder="ayesha.khan@university.edu"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                    />
                  </div>

                  <div>
                    <Label htmlFor="password">Password (min 8 characters)</Label>
                    <Input
                      id="password"
                      type="password"
                      autoComplete="new-password"
                      required
                      minLength={8}
                      placeholder="Create a strong password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                    />
                  </div>

                  <Button type="submit" className="w-full" size="lg" disabled={submitting}>
                    {submitting ? (
                      <>
                        <Spinner /> Creating account…
                      </>
                    ) : (
                      <>
                        <UserPlus className="h-4 w-4" /> Register as Candidate
                      </>
                    )}
                  </Button>
                </form>

                <div className="mt-5 flex items-center justify-between border-t border-border pt-4 text-xs text-ink-muted">
                  <span>Already registered?</span>
                  <Link href="/login" className="font-semibold text-accent hover:underline">
                    Sign in
                  </Link>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
