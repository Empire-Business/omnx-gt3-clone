import { useState, useEffect, useCallback } from "react";
import { User, Session } from "@supabase/supabase-js";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

interface Profile {
  user_id: string;
  tenant_id: string;
  full_name: string | null;
  avatar_url: string | null;
}

const LOCALHOST_HOSTNAMES = new Set(["localhost", "127.0.0.1", "::1"]);

function normalizeUrl(url?: string | null) {
  if (!url) return null;

  try {
    return new URL(url).toString().replace(/\/$/, "");
  } catch {
    return null;
  }
}

function isLocalUrl(url?: string | null) {
  if (!url) return false;

  try {
    return LOCALHOST_HOSTNAMES.has(new URL(url).hostname);
  } catch {
    return false;
  }
}

function resolveSiteUrl() {
  const envSiteUrl = normalizeUrl(import.meta.env.VITE_SITE_URL);
  const runtimeOrigin = typeof window !== "undefined" ? normalizeUrl(window.location.origin) : null;

  // In production, prefer the real runtime origin over a stale localhost build value.
  if (runtimeOrigin && !isLocalUrl(runtimeOrigin)) {
    if (!envSiteUrl || isLocalUrl(envSiteUrl)) {
      return runtimeOrigin;
    }
  }

  return envSiteUrl || runtimeOrigin || "http://localhost:5173";
}

export function useAuth() {
  const queryClient = useQueryClient();
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchProfile = useCallback(async (userId: string) => {
    try {
      const { data, error } = await supabase
        .from("profiles")
        .select("*")
        .eq("user_id", userId)
        .maybeSingle();
      if (error) {
        // PGRST116 = no rows; outros são reais
        if ((error as any).code !== "PGRST116") {
          console.error(
            "[useAuth] fetchProfile error:",
            (error as any).code,
            (error as any).message,
            (error as any).details
          );
        }
        setProfile(null);
        return;
      }
      setProfile(data as Profile | null);
    } catch (err: any) {
      console.error("[useAuth] fetchProfile unexpected error:", err?.message ?? err);
      setProfile(null);
    }
  }, []);

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        setSession(session);
        setUser(session?.user ?? null);

        if (event === "SIGNED_OUT") {
          queryClient.clear();
        }

        if (session?.user) {
          if (event === "INITIAL_SESSION") {
            // Wait for profile before marking loading complete to avoid
            // components rendering with loading=false but profile=null.
            // setTimeout avoids Supabase auth deadlock.
            setTimeout(async () => {
              try {
                await fetchProfile(session.user.id);
              } finally {
                setLoading(false);
              }
            }, 0);
          } else {
            setTimeout(() => fetchProfile(session.user.id), 0);
          }
        } else {
          setProfile(null);
          if (event === "INITIAL_SESSION") {
            setLoading(false);
          }
        }
      }
    );

    return () => subscription.unsubscribe();
  }, [fetchProfile, queryClient]);

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
  };

  const siteUrl = resolveSiteUrl();

  const signUp = async (email: string, password: string, fullName?: string) => {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { full_name: fullName },
        emailRedirectTo: siteUrl,
      },
    });
    if (error) throw error;
    return data;
  };

  const signOut = async () => {
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
  };

  const resetPassword = async (email: string) => {
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${siteUrl}/reset-password`,
    });
    if (error) throw error;
  };

  const updatePassword = async (newPassword: string) => {
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    if (error) throw error;
  };

  const sendOtp = async (email: string) => {
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: siteUrl,
      },
    });
    if (error) throw error;
  };

  const resendSignupConfirmation = async (email: string) => {
    const { error } = await supabase.auth.resend({
      type: "signup",
      email,
      options: {
        emailRedirectTo: siteUrl,
      },
    });
    if (error) throw error;
  };

  const verifyOtp = async (email: string, token: string) => {
    const { error } = await supabase.auth.verifyOtp({
      email,
      token,
      type: "email",
    });
    if (error) throw error;
  };

  return {
    user,
    session,
    profile,
    loading,
    signIn,
    signUp,
    resendSignupConfirmation,
    signOut,
    resetPassword,
    updatePassword,
    sendOtp,
    verifyOtp,
  };
}
