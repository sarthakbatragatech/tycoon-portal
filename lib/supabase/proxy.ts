import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

const AUTH_FREE_PATHS = new Set(["/login", "/api/auth/complete-setup"]);

function isReadOnlyAllowedPath(pathname: string) {
  if (pathname === "/dispatch-planning") return true;
  if (pathname === "/profile") return true;
  if (pathname === "/orders") return false;
  if (pathname === "/orders/new") return false;
  if (pathname.startsWith("/orders/")) return true;
  return false;
}

function copyCookies(source: NextResponse, target: NextResponse) {
  source.cookies.getAll().forEach((cookie) => {
    target.cookies.set(cookie);
  });

  return target;
}

export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({
    request,
  });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));

          response = NextResponse.next({
            request,
          });

          cookiesToSet.forEach(({ name, value, options }) => {
            response.cookies.set(name, value, options);
          });
        },
      },
    }
  );

  const pathname = request.nextUrl.pathname;
  const { data: claimsData } = await supabase.auth.getClaims();
  const userId = claimsData?.claims?.sub;
  const isAuthFree = AUTH_FREE_PATHS.has(pathname);

  if (!userId) {
    if (isAuthFree) {
      return response;
    }

    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = "/login";
    return copyCookies(response, NextResponse.redirect(loginUrl));
  }

  const { data: profile } = await supabase
    .from("user_profiles")
    .select("role")
    .eq("id", userId)
    .maybeSingle();

  if (!profile) {
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = "/login";
    return copyCookies(response, NextResponse.redirect(loginUrl));
  }

  if (pathname === "/login") {
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = profile.role === "admin" ? "/" : "/dispatch-planning";
    return copyCookies(response, NextResponse.redirect(redirectUrl));
  }

  if (profile.role !== "admin" && !isReadOnlyAllowedPath(pathname)) {
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = "/dispatch-planning";
    return copyCookies(response, NextResponse.redirect(redirectUrl));
  }

  return response;
}
