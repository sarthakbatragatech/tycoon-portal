export type AppRole = "admin" | "viewer";

export type AuthUserContext = {
  userId: string;
  username: string;
  role: AppRole;
} | null;
