import "server-only";

import { randomBytes } from "node:crypto";
import type { AppRole } from "@/lib/auth/types";
import { createAdminClient } from "@/lib/supabase/admin";
import { internalEmailForUsername, normalizeUsername } from "@/lib/auth/usernames";
import type { PortalUserListItem, PortalUserStatus } from "@/lib/admin/types";

type AllowedUserRow = {
  username: string;
  role: AppRole;
  setup_code: string;
  auth_user_id: string | null;
  is_active: boolean;
  setup_completed_at: string | null;
  created_at: string;
  updated_at: string;
};

type UserProfileRow = {
  id: string;
  username: string;
  role: AppRole;
  must_change_password: boolean;
  created_at: string;
  updated_at: string;
};

function generateSetupCode() {
  return randomBytes(6).toString("hex");
}

function getPortalUserStatus(user: AllowedUserRow): PortalUserStatus {
  if (!user.is_active) return "disabled";
  if (user.auth_user_id) return "active";
  return "invite_ready";
}

async function getAllowedUser(username: string) {
  const normalizedUsername = normalizeUsername(username);
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("allowed_users")
    .select("username, role, setup_code, auth_user_id, is_active, setup_completed_at, created_at, updated_at")
    .eq("username", normalizedUsername)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  if (!data) {
    throw new Error("User was not found.");
  }

  return data as AllowedUserRow;
}

async function ensureAnotherActiveAdminExists(username: string) {
  const normalizedUsername = normalizeUsername(username);
  const supabase = createAdminClient();
  const { count, error } = await supabase
    .from("allowed_users")
    .select("username", { count: "exact", head: true })
    .eq("role", "admin")
    .eq("is_active", true)
    .neq("username", normalizedUsername);

  if (error) {
    throw new Error(error.message);
  }

  if (!count) {
    throw new Error("You cannot remove or demote the last active admin.");
  }
}

async function deleteLinkedAccess(username: string, authUserId: string | null) {
  const normalizedUsername = normalizeUsername(username);
  const supabase = createAdminClient();

  if (authUserId) {
    const { error: deleteAuthError } = await supabase.auth.admin.deleteUser(authUserId);

    if (deleteAuthError) {
      throw new Error(deleteAuthError.message);
    }
  }

  const { error: deleteProfileError } = await supabase.from("user_profiles").delete().eq("username", normalizedUsername);

  if (deleteProfileError) {
    throw new Error(deleteProfileError.message);
  }
}

export async function listPortalUsers(): Promise<PortalUserListItem[]> {
  const supabase = createAdminClient();
  const [{ data: allowedUsers, error: allowedUsersError }, { data: profiles, error: profilesError }] =
    await Promise.all([
      supabase
        .from("allowed_users")
        .select("username, role, setup_code, auth_user_id, is_active, setup_completed_at, created_at, updated_at")
        .order("username", { ascending: true }),
      supabase
        .from("user_profiles")
        .select("id, username, role, must_change_password, created_at, updated_at")
        .order("username", { ascending: true }),
    ]);

  if (allowedUsersError) {
    throw new Error(allowedUsersError.message);
  }

  if (profilesError) {
    throw new Error(profilesError.message);
  }

  const profilesByUsername = new Map(
    ((profiles || []) as UserProfileRow[]).map((profile) => [profile.username, profile])
  );

  return ((allowedUsers || []) as AllowedUserRow[])
    .map((allowedUser) => {
      const liveProfile = profilesByUsername.get(allowedUser.username) ?? null;

      return {
        username: allowedUser.username,
        invitedRole: allowedUser.role,
        liveRole: liveProfile?.role ?? null,
        effectiveRole: liveProfile?.role ?? allowedUser.role,
        internalEmail: internalEmailForUsername(allowedUser.username),
        status: getPortalUserStatus(allowedUser),
        isActive: allowedUser.is_active,
        hasCompletedSetup: Boolean(allowedUser.auth_user_id || allowedUser.setup_completed_at || liveProfile),
        setupCode: allowedUser.setup_code,
        authUserId: allowedUser.auth_user_id,
        setupCompletedAt: allowedUser.setup_completed_at,
        createdAt: allowedUser.created_at,
        updatedAt: allowedUser.updated_at,
      };
    })
    .sort((left, right) => {
      if (left.effectiveRole !== right.effectiveRole) {
        return left.effectiveRole === "admin" ? -1 : 1;
      }

      if (left.status !== right.status) {
        const statusOrder: Record<PortalUserStatus, number> = {
          active: 0,
          invite_ready: 1,
          disabled: 2,
        };

        return statusOrder[left.status] - statusOrder[right.status];
      }

      return left.username.localeCompare(right.username);
    });
}

export async function createPortalUserInvite(input: { username: string; role: AppRole }) {
  const supabase = createAdminClient();
  const username = normalizeUsername(input.username);
  const role = input.role;

  if (!username) {
    throw new Error("Username is required.");
  }

  const { data: existingUser, error: existingUserError } = await supabase
    .from("allowed_users")
    .select("username")
    .eq("username", username)
    .maybeSingle();

  if (existingUserError) {
    throw new Error(existingUserError.message);
  }

  if (existingUser) {
    throw new Error("That username already exists. Update the existing user instead.");
  }

  const setupCode = generateSetupCode();
  const { error } = await supabase.from("allowed_users").insert({
    username,
    role,
    setup_code: setupCode,
    is_active: true,
  });

  if (error) {
    throw new Error(error.message);
  }

  return {
    username,
    role,
    setupCode,
  };
}

export async function updatePortalUserRole(input: {
  username: string;
  role: AppRole;
  actingUsername: string;
}) {
  const supabase = createAdminClient();
  const username = normalizeUsername(input.username);
  const role = input.role;
  const actingUsername = normalizeUsername(input.actingUsername);
  const allowedUser = await getAllowedUser(username);

  if (username === actingUsername && role !== allowedUser.role) {
    throw new Error("Use a different admin account to change your own role.");
  }

  if (allowedUser.role === "admin" && role !== "admin") {
    await ensureAnotherActiveAdminExists(username);
  }

  const { error: allowedUserError } = await supabase.from("allowed_users").update({ role }).eq("username", username);

  if (allowedUserError) {
    throw new Error(allowedUserError.message);
  }

  const { error: profileError } = await supabase.from("user_profiles").update({ role }).eq("username", username);

  if (profileError) {
    throw new Error(profileError.message);
  }

  return {
    username,
    role,
  };
}

export async function regeneratePortalUserSetupCode(username: string) {
  const supabase = createAdminClient();
  const normalizedUsername = normalizeUsername(username);
  const allowedUser = await getAllowedUser(normalizedUsername);

  if (allowedUser.auth_user_id || allowedUser.setup_completed_at) {
    throw new Error("Use reset account for a user who has already completed setup.");
  }

  const setupCode = generateSetupCode();
  const { error } = await supabase
    .from("allowed_users")
    .update({
      setup_code: setupCode,
      is_active: true,
    })
    .eq("username", normalizedUsername);

  if (error) {
    throw new Error(error.message);
  }

  return {
    username: normalizedUsername,
    setupCode,
  };
}

export async function disablePortalUser(input: {
  username: string;
  actingUsername: string;
}) {
  const supabase = createAdminClient();
  const username = normalizeUsername(input.username);
  const actingUsername = normalizeUsername(input.actingUsername);
  const allowedUser = await getAllowedUser(username);

  if (username === actingUsername) {
    throw new Error("Use a different admin account to disable your own access.");
  }

  if (allowedUser.role === "admin" && allowedUser.is_active) {
    await ensureAnotherActiveAdminExists(username);
  }

  await deleteLinkedAccess(username, allowedUser.auth_user_id);

  const { error } = await supabase
    .from("allowed_users")
    .update({
      is_active: false,
      auth_user_id: null,
    })
    .eq("username", username);

  if (error) {
    throw new Error(error.message);
  }

  return {
    username,
  };
}

export async function enablePortalUser(username: string) {
  const supabase = createAdminClient();
  const normalizedUsername = normalizeUsername(username);
  const allowedUser = await getAllowedUser(normalizedUsername);

  if (allowedUser.auth_user_id) {
    await deleteLinkedAccess(normalizedUsername, allowedUser.auth_user_id);
  }

  const setupCode = generateSetupCode();
  const { error } = await supabase
    .from("allowed_users")
    .update({
      is_active: true,
      auth_user_id: null,
      setup_completed_at: null,
      setup_code: setupCode,
    })
    .eq("username", normalizedUsername);

  if (error) {
    throw new Error(error.message);
  }

  return {
    username: normalizedUsername,
    setupCode,
  };
}

export async function resetPortalUserAccount(input: {
  username: string;
  actingUsername: string;
}) {
  const supabase = createAdminClient();
  const username = normalizeUsername(input.username);
  const actingUsername = normalizeUsername(input.actingUsername);
  const allowedUser = await getAllowedUser(username);

  if (username === actingUsername) {
    throw new Error("Use a different admin account to reset your own login.");
  }

  await deleteLinkedAccess(username, allowedUser.auth_user_id);

  const setupCode = generateSetupCode();
  const { error } = await supabase
    .from("allowed_users")
    .update({
      is_active: true,
      auth_user_id: null,
      setup_completed_at: null,
      setup_code: setupCode,
    })
    .eq("username", username);

  if (error) {
    throw new Error(error.message);
  }

  return {
    username,
    setupCode,
  };
}

export async function deletePortalUser(input: {
  username: string;
  actingUsername: string;
}) {
  const supabase = createAdminClient();
  const username = normalizeUsername(input.username);
  const actingUsername = normalizeUsername(input.actingUsername);
  const allowedUser = await getAllowedUser(username);

  if (username === actingUsername) {
    throw new Error("Use a different admin account to delete your own account.");
  }

  if (allowedUser.role === "admin" && allowedUser.is_active) {
    await ensureAnotherActiveAdminExists(username);
  }

  await deleteLinkedAccess(username, allowedUser.auth_user_id);

  const { error } = await supabase.from("allowed_users").delete().eq("username", username);

  if (error) {
    throw new Error(error.message);
  }

  return {
    username,
  };
}
