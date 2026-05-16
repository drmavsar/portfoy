"use client";

import { useState } from "react";

import { useRouter, useSearchParams } from "next/navigation";

import { createClient } from "@/lib/supabase/client";

export function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const redirect = params.get("redirect") ?? "/dashboard";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<"sign-in" | "sign-up">("sign-in");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const supabase = createClient();

    const { error } =
      mode === "sign-in"
        ? await supabase.auth.signInWithPassword({ email, password })
        : await supabase.auth.signUp({ email, password });

    setBusy(false);
    if (error) {
      setError(error.message);
      return;
    }

    if (mode === "sign-up") {
      await supabase.rpc("bootstrap_user_defaults");
    }

    router.replace(redirect);
    router.refresh();
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <form
        onSubmit={submit}
        className="w-full max-w-sm rounded-2xl border border-[color:var(--border)] bg-[color:var(--surface)] p-8"
      >
        <h1 className="text-xl font-semibold mb-1">Mehmet&apos;s Assets</h1>
        <p className="text-sm text-[color:var(--muted)] mb-6">
          {mode === "sign-in" ? "Giriş yap." : "Hesap oluştur."}
        </p>

        <label className="block text-xs mb-1 text-[color:var(--muted)]">
          E-posta
        </label>
        <input
          type="email"
          required
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="w-full mb-4 px-3 py-2 rounded-md border border-[color:var(--border)] bg-transparent text-sm"
        />

        <label className="block text-xs mb-1 text-[color:var(--muted)]">
          Şifre
        </label>
        <input
          type="password"
          required
          minLength={8}
          autoComplete={
            mode === "sign-in" ? "current-password" : "new-password"
          }
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="w-full mb-4 px-3 py-2 rounded-md border border-[color:var(--border)] bg-transparent text-sm"
        />

        {error && (
          <p className="mb-3 text-xs text-[color:var(--negative)]">{error}</p>
        )}

        <button
          type="submit"
          disabled={busy}
          className="w-full mb-3 py-2 rounded-md bg-[color:var(--primary)] text-[color:var(--primary-foreground)] text-sm font-medium disabled:opacity-50"
        >
          {busy ? "..." : mode === "sign-in" ? "Giriş Yap" : "Kayıt Ol"}
        </button>

        <button
          type="button"
          onClick={() =>
            setMode(mode === "sign-in" ? "sign-up" : "sign-in")
          }
          className="w-full text-xs text-[color:var(--muted)] hover:text-[color:var(--foreground)]"
        >
          {mode === "sign-in"
            ? "Hesabın yok mu? Kayıt ol"
            : "Zaten hesabın var mı? Giriş yap"}
        </button>
      </form>
    </div>
  );
}
