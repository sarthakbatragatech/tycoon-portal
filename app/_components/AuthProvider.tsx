"use client";

import { createContext, useContext } from "react";
import type { AuthUserContext } from "@/lib/auth/types";

const AuthContext = createContext<AuthUserContext>(null);

export function AuthProvider({
  children,
  value,
}: {
  children: React.ReactNode;
  value: AuthUserContext;
}) {
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuthContext() {
  return useContext(AuthContext);
}
