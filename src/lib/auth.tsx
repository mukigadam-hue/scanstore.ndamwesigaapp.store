import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { User, Session } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

interface AuthContextType {
  user: User | null;
  session: Session | null;
  loading: boolean;
  signUp: (email: string, password: string) => Promise<{ error: any }>;
  signIn: (email: string, password: string) => Promise<{ error: any }>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Safety timeout: if auth never resolves, unblock UI after 5s
    const timeout = setTimeout(() => {
      setLoading(false);
    }, 5000);

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      clearTimeout(timeout);
      setSession(session);
      setUser(session?.user ?? null);
      setLoading(false);
    });

    supabase.auth.getSession().then(({ data: { session } }) => {
      clearTimeout(timeout);
      setSession(session);
      setUser(session?.user ?? null);
      setLoading(false);
    }).catch(async () => {
      // Clear corrupted/expired tokens to stop infinite refresh loop
      try { await supabase.auth.signOut(); } catch {}
      setSession(null);
      setUser(null);
      setLoading(false);
    });

    return () => {
      clearTimeout(timeout);
      subscription.unsubscribe();
    };
  }, []);

  const signUp = async (email: string, password: string) => {
    const { error } = await supabase.auth.signUp({ email, password });
    return { error };
  };

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return { error };
  };

  const signOut = async () => {
    // Clear any per-user verification + recovery flags so the next user starts fresh.
    try {
      const uid = user?.id;
      if (uid) {
        localStorage.removeItem(`locker_verified_${uid}`);
        localStorage.removeItem(`security_otp_${uid}`);
      }
      // NOTE: we intentionally do NOT clear pendingVaultFile here, so files
      // staged from the public flow survive auto-lock & re-verification.
      sessionStorage.removeItem("pendingVaultFile");
      sessionStorage.removeItem("launchAdShown");
    } catch {}

    // Try a global sign-out, then fall back to local so a missing/expired session
    // never blocks the UI from logging the user out.
    try {
      await supabase.auth.signOut({ scope: "global" });
    } catch {
      try { await supabase.auth.signOut({ scope: "local" } as any); } catch {}
    }

    // Force local state clear even if Supabase didn't fire onAuthStateChange.
    setSession(null);
    setUser(null);

    // Keep sign-out inside the SPA. A hard page reload/navigation can be
    // interpreted by Android WebView ad shells as a navigation event and show
    // an abrupt interstitial. Individual screens navigate after signOut().
    if (typeof window !== "undefined") {
      sessionStorage.setItem("showLandingOnce", "1");
    }
  };

  return (
    <AuthContext.Provider value={{ user, session, loading, signUp, signIn, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used within AuthProvider");
  return context;
}
