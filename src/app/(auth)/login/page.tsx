"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { ClipboardCheck, Loader2 } from "lucide-react";
import type { AuthMeResponse } from "@/types/contracts";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  async function redirectAfterAuth() {
    const res = await fetch("/api/auth/me", { cache: "no-store" });
    if (!res.ok) {
      throw new Error("Não foi possível validar o perfil do usuário.");
    }
    const me: AuthMeResponse = await res.json();
    if (!me.user) {
      throw new Error("Sessão não encontrada ou usuário inativo.");
    }
    router.replace(me.user.role === "manager" ? "/planilha" : "/campo");
    router.refresh();
  }

  async function handleSupabaseLogin(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const supabase = createSupabaseBrowserClient();
      if (!supabase) {
        throw new Error("Cliente Supabase não configurado neste ambiente.");
      }
      const { error: signInErr } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });
      if (signInErr) {
        throw new Error(signInErr.message);
      }
      await redirectAfterAuth();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao entrar.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="flex min-h-dvh items-center justify-center bg-gradient-to-br from-slate-950 via-slate-900 to-sky-950 p-4">
      <div className="w-full max-w-md space-y-4">
        <div className="text-center text-white space-y-1.5">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-sky-500 text-slate-950 font-bold text-lg shadow-lg">
            MD
          </div>
          <h1 className="text-2xl font-bold tracking-tight">Medições Diárias</h1>
          <p className="text-xs text-slate-300">
            Modo Campo Offline-first com OCR &bull; Modo Planilha Gerencial
          </p>
        </div>

        <Card className="border-slate-800 bg-white/95 shadow-2xl">
          <CardHeader className="flex-row items-center justify-between">
            <div>
              <h2 className="text-base font-semibold text-slate-900">
                Acesso ao Sistema
              </h2>
              <p className="text-xs text-slate-500">
                Entre com seu e-mail e senha cadastrados
              </p>
            </div>
            <Badge variant="info">Supabase Auth</Badge>
          </CardHeader>

          <CardContent className="space-y-4">
            {error ? (
              <div
                role="alert"
                className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-medium text-rose-700"
              >
                {error}
              </div>
            ) : null}

            <form onSubmit={handleSupabaseLogin} className="space-y-3">
              <div className="space-y-1">
                <label
                  htmlFor="login-email"
                  className="block text-xs font-medium text-slate-700"
                >
                  E-mail
                </label>
                <Input
                  id="login-email"
                  type="email"
                  required
                  autoComplete="email"
                  placeholder="usuario@empresa.com.br"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>
              <div className="space-y-1">
                <label
                  htmlFor="login-password"
                  className="block text-xs font-medium text-slate-700"
                >
                  Senha
                </label>
                <Input
                  id="login-password"
                  type="password"
                  required
                  autoComplete="current-password"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </div>
              <Button
                type="submit"
                className="w-full"
                size="lg"
                disabled={loading}
              >
                {loading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <ClipboardCheck className="h-4 w-4" />
                )}
                Entrar
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
