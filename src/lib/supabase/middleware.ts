import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

import type { Database } from "@/lib/types/database";

// `/api/cron` ve `/api/admin` route handler'ları Vercel cron / manuel cron'un
// gönderdiği Bearer token ile kendileri kimlik doğrular; middleware'in
// Supabase user kontrolüyle /login'e redirect etmemesi gerekir, aksi halde
// route'a hiç ulaşamaz. Service-role client RLS bypass etse de auth gate
// onlardan önce çalışır.
const PUBLIC_PATHS = ["/login", "/auth", "/api/health", "/api/cron", "/api/admin"];

export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });

  // No Supabase configured (dev / demo build) → pass through.
  if (
    !process.env.NEXT_PUBLIC_SUPABASE_URL ||
    !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  ) {
    return response;
  }

  const supabase = createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const path = request.nextUrl.pathname;
  const isPublic = PUBLIC_PATHS.some((p) => path === p || path.startsWith(`${p}/`));

  if (!user && !isPublic) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("redirect", path);
    return NextResponse.redirect(url);
  }

  return response;
}
