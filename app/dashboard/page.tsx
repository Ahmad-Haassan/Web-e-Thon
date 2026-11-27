"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth, roleHomePath } from "@/hooks/use-auth";
import { Spinner } from "@/components/ui/primitives";

export default function DashboardRedirectPage() {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;
    if (!user) {
      router.replace("/login");
    } else if (!user.active) {
      router.replace("/pending-approval");
    } else {
      router.replace(roleHomePath(user.role));
    }
  }, [user, loading, router]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <div className="flex items-center gap-2 text-sm text-ink-muted">
        <Spinner className="h-5 w-5 text-accent" />
        Redirecting to your role workspace…
      </div>
    </div>
  );
}
