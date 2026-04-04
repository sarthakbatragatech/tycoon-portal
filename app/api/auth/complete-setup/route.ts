import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { internalEmailForUsername, normalizeUsername } from "@/lib/auth/usernames";

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const username = normalizeUsername(body?.username || "");
  const setupCode = String(body?.setupCode || "").trim();
  const password = String(body?.password || "");

  if (!username) {
    return NextResponse.json({ error: "Username is required." }, { status: 400 });
  }

  if (!setupCode) {
    return NextResponse.json({ error: "Setup code is required." }, { status: 400 });
  }

  if (password.length < 8) {
    return NextResponse.json({ error: "Password must be at least 8 characters." }, { status: 400 });
  }

  const supabase = createAdminClient();
  const { data: allowedUser, error: allowedUserError } = await supabase
    .from("allowed_users")
    .select("username, role, setup_code, auth_user_id, is_active, setup_completed_at")
    .eq("username", username)
    .maybeSingle();

  if (allowedUserError) {
    return NextResponse.json({ error: allowedUserError.message }, { status: 500 });
  }

  if (!allowedUser || !allowedUser.is_active) {
    return NextResponse.json({ error: "Username is not allowed for this portal." }, { status: 404 });
  }

  if (allowedUser.auth_user_id || allowedUser.setup_completed_at) {
    return NextResponse.json({ error: "Account setup has already been completed." }, { status: 409 });
  }

  if (allowedUser.setup_code !== setupCode) {
    return NextResponse.json({ error: "Setup code is invalid." }, { status: 401 });
  }

  const email = internalEmailForUsername(username);
  const { data: createdUserData, error: createUserError } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: {
      username,
    },
  });

  if (createUserError || !createdUserData.user) {
    return NextResponse.json(
      { error: createUserError?.message || "Could not create the Supabase auth user." },
      { status: 400 }
    );
  }

  const userId = createdUserData.user.id;

  const { error: profileError } = await supabase.from("user_profiles").upsert(
    {
      id: userId,
      username,
      role: allowedUser.role,
      must_change_password: false,
    },
    {
      onConflict: "id",
    }
  );

  if (profileError) {
    await supabase.auth.admin.deleteUser(userId);
    return NextResponse.json({ error: profileError.message }, { status: 500 });
  }

  const { error: updateAllowedUserError } = await supabase
    .from("allowed_users")
    .update({
      auth_user_id: userId,
      setup_completed_at: new Date().toISOString(),
    })
    .eq("username", username);

  if (updateAllowedUserError) {
    await supabase.from("user_profiles").delete().eq("id", userId);
    await supabase.auth.admin.deleteUser(userId);
    return NextResponse.json({ error: updateAllowedUserError.message }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    username,
    role: allowedUser.role,
  });
}
