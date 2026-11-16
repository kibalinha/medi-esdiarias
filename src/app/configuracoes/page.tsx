"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import type { AuthMeResponse, CatalogResponse } from "@/types/contracts";
import { AppNav } from "@/components/ui/app-nav";
import { Button } from "@/components/ui/button";
import { CatalogManager } from "@/components/configuracoes/CatalogManager";
import { ImportExportPanel } from "@/components/configuracoes/ImportExportPanel";
import { UsersAndAlertsPanel } from "@/components/configuracoes/UsersAndAlertsPanel";

export default function ConfiguracoesPage() {
  const router = useRouter();
  const [auth, setAuth] = React.useState<AuthMeResponse | null>(null);
  const [catalog, setCatalog] = React.useState<CatalogResponse | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  const fetchData = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const meRes = await fetch("/api/auth/me", { cache: "no-store" });
      if (!meRes.ok) {
        router.replace("/login");
        return;
      }
      const meData: AuthMeResponse = await meRes.json();
      setAuth(meData);

      if (!meData.user) {
        router.replace("/login");
        return;
      }
      if (meData.user.role !== "manager") {
        router.replace("/campo");
        return;
      }

      const catRes = await fetch("/api/catalog", { cache: "no-store" });
      if (!catRes.ok) {
        const err = await catRes.json().catch(() => null);
        throw new Error(
          err?.error || `Erro HTTP ${catRes.status} ao carregar catálogo.`,
        );
      }
      setCatalog(await catRes.json());
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Erro ao carregar configurações.",
      );
    } finally {
      setLoading(false);
    }
  }, [router]);

  React.useEffect(() => {
    void fetchData();
  }, [fetchData]);

  if (!auth?.user || auth.user.role !== "manager") {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-slate-100 text-sm text-slate-500 gap-2">
        <Loader2 className="h-5 w-5 animate-spin text-sky-600" />
        Verificando permissões...
      </div>
    );
  }

  return (
    <div className="min-h-dvh bg-slate-100">
      <AppNav
        user={auth.user}
        dataMode={auth.data_mode}
      />

      <main className="mx-auto max-w-[1400px] space-y-5 px-4 py-5">
        <div>
          <h1 className="text-lg font-bold text-slate-900">
            Configurações, Catálogo e Administração
          </h1>
          <p className="text-xs text-slate-500">
            Exclusivo Gestor: ative setores como Chillers 1/2, ajuste tetos de
            demanda, condutivímetro, fatores e importe/exporte XLSX.
          </p>
        </div>

        {loading && !catalog ? (
          <div className="flex items-center justify-center rounded-xl border border-slate-200 bg-white py-16 text-sm text-slate-500 gap-2">
            <Loader2 className="h-5 w-5 animate-spin text-sky-600" />
            Carregando catálogo...
          </div>
        ) : error ? (
          <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800 space-y-2">
            <p>{error}</p>
            <Button size="sm" onClick={() => void fetchData()}>
              Tentar novamente
            </Button>
          </div>
        ) : catalog ? (
          <>
            <UsersAndAlertsPanel
              users={catalog.users ?? []}
              groups={catalog.groups}
              onUpdated={() => void fetchData()}
            />
            <ImportExportPanel onImported={() => void fetchData()} />
            <CatalogManager
              catalog={catalog}
              onUpdated={() => void fetchData()}
            />
          </>
        ) : null}
      </main>
    </div>
  );
}
