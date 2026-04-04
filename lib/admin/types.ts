import type { AppRole } from "@/lib/auth/types";

export type PortalUserStatus = "active" | "invite_ready" | "disabled";

export type PortalUserListItem = {
  username: string;
  invitedRole: AppRole;
  liveRole: AppRole | null;
  effectiveRole: AppRole;
  internalEmail: string;
  status: PortalUserStatus;
  isActive: boolean;
  hasCompletedSetup: boolean;
  setupCode: string;
  authUserId: string | null;
  setupCompletedAt: string | null;
  createdAt: string;
  updatedAt: string;
};
