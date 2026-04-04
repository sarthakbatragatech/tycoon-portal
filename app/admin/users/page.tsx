export const dynamic = "force-dynamic";

import { redirect } from "next/navigation";
import { listPortalUsers } from "@/lib/admin/portal-users";
import { getAuthContext } from "@/lib/auth/server";
import AdminUsersClient from "./_components/AdminUsersClient";

export default async function AdminUsersPage() {
  const auth = await getAuthContext();

  if (!auth) {
    redirect("/login");
  }

  if (auth.role !== "admin") {
    redirect("/dispatch-planning");
  }

  const users = await listPortalUsers();

  return <AdminUsersClient currentUsername={auth.username} users={users} />;
}
