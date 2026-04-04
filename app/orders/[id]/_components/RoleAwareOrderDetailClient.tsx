"use client";

import { useAuthContext } from "@/app/_components/AuthProvider";
import OrderDetailClient from "./OrderDetailClient";
import ViewerOrderDetailClient from "./ViewerOrderDetailClient";

export default function RoleAwareOrderDetailClient() {
  const auth = useAuthContext();

  if (auth?.role !== "admin") {
    return <ViewerOrderDetailClient />;
  }

  return <OrderDetailClient />;
}
