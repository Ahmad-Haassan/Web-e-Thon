"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useRouter } from "next/navigation";
import { api, ApiError } from "@/lib/client/api";
import { getBrowserSupabase, isSupabaseConfigured } from "@/lib/client/supabase";
import type { AppUser, UserRole, WorkspacePrefs } from "@/lib/client/api-types";

export const DEFAULT_PREFS: WorkspacePrefs = {
  fontSize: "md",
  theme: "light",
  highContrast: false,
  palettePosition: "right",
  splitLayout: false,
};

const PREFS_STORAGE_KEY = "veriexam:prefs";

function applyPrefsToDocument(prefs: WorkspacePrefs) {
  if (typeof document === "undefined") return;
  const root = document.documentElement;

  let resolvedTheme: "light" | "dark" = "light";
  if (prefs.theme === "dark") {
    resolvedTheme = "dark";
  } else if (prefs.theme === "system") {
    resolvedTheme = window.matchMedia?.("(prefers-color-scheme: dark)").matches
      ? "dark"
      : "light";
  }

  root.dataset.theme = resolvedTheme;
  root.dataset.contrast = prefs.highContrast ? "high" : "normal";
  root.dataset.fontSize = prefs.fontSize;
}

export function roleHomePath(role: UserRole): string {
  switch (role) {
    case "ADMIN":
      return "/admin";
    case "EXAMINER":
      return "/examiner";
    case "CANDIDATE":
    default:
      return "/candidate";
  }
}

interface AuthContextValue {
  user: AppUser | null;
  loading: boolean;
  error: string | null;
  prefs: WorkspacePrefs;
  refreshUser: () => Promise<AppUser | null>;
  updatePrefs: (partial: Partial<WorkspacePrefs>) => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [user, setUser] = useState<AppUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [prefs, setPrefs] = useState<WorkspacePrefs>(DEFAULT_PREFS);

  // Hydrate locally stored prefs immediately to avoid flash
  useEffect(() => {
    const t = setTimeout(() => {
      try {
        const raw = localStorage.getItem(PREFS_STORAGE_KEY);
        if (raw) {
          const parsed = { ...DEFAULT_PREFS, ...JSON.parse(raw) } as WorkspacePrefs;
          setPrefs(parsed);
          applyPrefsToDocument(parsed);
        } else {
          applyPrefsToDocument(DEFAULT_PREFS);
        }
      } catch {
        applyPrefsToDocument(DEFAULT_PREFS);
      }
    }, 0);
    return () => clearTimeout(t);
  }, []);

  const refreshUser = useCallback(async (): Promise<AppUser | null> => {
    if (!isSupabaseConfigured()) {
      setUser(null);
      setLoading(false);
      return null;
    }
    try {
      const supabase = getBrowserSupabase();
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session) {
        setUser(null);
        setError(null);
        setLoading(false);
        return null;
      }

      // If user has Google Authenticator (AAL2) enrolled, hold profile until 2FA code is verified
      const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
      if (aal?.nextLevel === "aal2" && aal?.currentLevel !== "aal2") {
        setUser(null);
        setError(null);
        setLoading(false);
        return null;
      }

      const res = await api.me.get();
      setUser(res.user);
      setError(null);

      if (res.user?.prefs) {
        const merged = { ...DEFAULT_PREFS, ...res.user.prefs };
        setPrefs(merged);
        applyPrefsToDocument(merged);
        try {
          localStorage.setItem(PREFS_STORAGE_KEY, JSON.stringify(merged));
        } catch {
          // ignore
        }
      }
      setLoading(false);
      return res.user;
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        setUser(null);
        setError(null);
      } else if (err instanceof ApiError && err.status === 403) {
        setUser(null);
        setError(err.message);
      } else {
        setError(err instanceof Error ? err.message : "Failed to load profile");
      }
      setLoading(false);
      return null;
    }
  }, []);

  useEffect(() => {
    let active = true;
    const init = setTimeout(() => {
      if (active) void refreshUser();
    }, 0);

    if (!isSupabaseConfigured()) {
      return () => {
        active = false;
        clearTimeout(init);
      };
    }
    const supabase = getBrowserSupabase();
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event) => {
      if (!active) return;
      if (event === "SIGNED_IN" || event === "TOKEN_REFRESHED") {
        void refreshUser();
      } else if (event === "SIGNED_OUT") {
        setUser(null);
        setLoading(false);
      }
    });

    return () => {
      active = false;
      clearTimeout(init);
      subscription.unsubscribe();
    };
  }, [refreshUser]);

  const updatePrefs = useCallback(
    async (partial: Partial<WorkspacePrefs>) => {
      const next = { ...prefs, ...partial };
      setPrefs(next);
      applyPrefsToDocument(next);
      try {
        localStorage.setItem(PREFS_STORAGE_KEY, JSON.stringify(next));
      } catch {
        // ignore
      }
      if (user) {
        try {
          const res = await api.me.updatePrefs(partial);
          if (res.prefs) {
            const synced = { ...DEFAULT_PREFS, ...res.prefs };
            setPrefs(synced);
            applyPrefsToDocument(synced);
          }
        } catch {
          // Keep local prefs if offline
        }
      }
    },
    [prefs, user]
  );

  const signOut = useCallback(async () => {
    if (isSupabaseConfigured()) {
      const supabase = getBrowserSupabase();
      await supabase.auth.signOut();
    }
    setUser(null);
    router.push("/login");
  }, [router]);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      loading,
      error,
      prefs,
      refreshUser,
      updatePrefs,
      signOut,
    }),
    [user, loading, error, prefs, refreshUser, updatePrefs, signOut]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}
