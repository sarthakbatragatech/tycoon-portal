import "server-only";

import type { AuthUserContext } from "@/lib/auth/types";
import { createClient } from "@/lib/supabase/server";

export async function getAuthContext(): Promise<AuthUserContext> {
  const supabase = await createClient();
  const { data: claimsData, error: claimsError } = await supabase.auth.getClaims();

  if (claimsError) {
    return null;
  }

  const userId = claimsData?.claims?.sub;
  if (!userId) {
    return null;
  }

  const { data: profile, error: profileError } = await supabase
    .from("user_profiles")
    .select("id, username, role")
    .eq("id", userId)
    .maybeSingle();

  if (profileError || !profile) {
    return null;
  }

  return {
    userId: profile.id,
    username: profile.username,
    role: profile.role,
  };
}
