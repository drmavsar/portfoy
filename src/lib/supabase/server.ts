import { cookies } from "next/headers";

import { createServerClient } from "@supabase/ssr";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/lib/types/database";

export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            );
          } catch {
            // setAll fails inside RSC; safe to ignore — middleware refreshes.
          }
        },
      },
    },
  );
}

export async function createServiceClient() {
  const cookieStore = await cookies();
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY ??
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    key,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll() {
          /* service client never writes auth cookies */
        },
      },
    },
  );
}

/**
 * Gerçek service-role istemcisi: oturum çerezi taşımaz, RLS'i atlar.
 *
 * `createServiceClient` kullanıcı çerezlerini de geçirdiği için oturum açıkken
 * istekler kullanıcının access token'ıyla (authenticated rolü) gider ve RLS
 * uygulanır. Yalnız okuma politikası olan global tablolara (ör. fund_prices)
 * yazmak için bunu kullan. Anahtar yoksa anon'a düşmez, null döner.
 */
export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createSupabaseClient<Database>(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
