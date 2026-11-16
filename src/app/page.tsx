"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import type { AuthMeResponse } from "@/types/contracts";

export default function HomePage() {
  const router = useRouter();

  React.useEffect(() => {
    let active = true;

    async function redirectByRole() {
      try {
        const res = await fetch("/api/auth/me", { cache: "no-store" });
        if (!active) return;
        if (!res.ok) {
          router.replace("/login");
          return;
        }
        const data: AuthMeResponse = await res.json();
        if (!data.user) {
          router.replace("/login");
          return;
        }
        router.replace(data.user.role === "manager" ? "/planilha" : "/campo");
      } catch {
        if (!active) return;
        // Offline fallback: technicians usually have cached /campo
        router.replace("/campo");
      }
    }

    void redirectByRole();
    return () => {
      active = false;
    };
  }, [router]);

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-3 bg-slate-950 text-white p-6">
      <Loader2 className="h-8 w-8 animate-spin text-sky-400" />
      <p className="text-sm text-slate-300">Carregando Medições Diárias...</p>
    </main>
  );
}
