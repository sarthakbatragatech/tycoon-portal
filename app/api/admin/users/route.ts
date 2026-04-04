import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import type { AppRole } from "@/lib/auth/types";
import { getAuthContext } from "@/lib/auth/server";
import {
  createPortalUserInvite,
  deletePortalUser,
  disablePortalUser,
  enablePortalUser,
  regeneratePortalUserSetupCode,
  resetPortalUserAccount,
  updatePortalUserRole,
} from "@/lib/admin/portal-users";

type MutationAction =
  | "create"
  | "change_role"
  | "regenerate_code"
  | "disable"
  | "enable"
  | "reset_account"
  | "delete";

function getRole(value: unknown): AppRole | null {
  return value === "admin" || value === "viewer" ? value : null;
}

export async function POST(request: Request) {
  const auth = await getAuthContext();

  if (!auth) {
    return NextResponse.json({ error: "You must be signed in." }, { status: 401 });
  }

  if (auth.role !== "admin") {
    return NextResponse.json({ error: "Only admins can manage users." }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const action = body?.action as MutationAction | undefined;
  const username = String(body?.username || "");
  const role = getRole(body?.role);

  try {
    let result: Record<string, unknown>;

    switch (action) {
      case "create":
        if (!role) {
          return NextResponse.json({ error: "Role is required." }, { status: 400 });
        }

        result = await createPortalUserInvite({ username, role });
        break;
      case "change_role":
        if (!role) {
          return NextResponse.json({ error: "Role is required." }, { status: 400 });
        }

        result = await updatePortalUserRole({
          username,
          role,
          actingUsername: auth.username,
        });
        break;
      case "regenerate_code":
        result = await regeneratePortalUserSetupCode(username);
        break;
      case "disable":
        result = await disablePortalUser({
          username,
          actingUsername: auth.username,
        });
        break;
      case "enable":
        result = await enablePortalUser(username);
        break;
      case "reset_account":
        result = await resetPortalUserAccount({
          username,
          actingUsername: auth.username,
        });
        break;
      case "delete":
        result = await deletePortalUser({
          username,
          actingUsername: auth.username,
        });
        break;
      default:
        return NextResponse.json({ error: "Unsupported action." }, { status: 400 });
    }

    revalidatePath("/admin/users");

    return NextResponse.json({
      ok: true,
      ...result,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not complete the action.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
