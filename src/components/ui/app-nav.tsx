"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  BarChart3,
  ClipboardList,
  LogOut,
  Settings,
  Table2,
  UserCheck,
} from "lucide-react";
import type { AuthUserProfile } from "@/types/contracts";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { cn } from "./cn";

interface AppNavProps {
  user: AuthUserProfile | null;
  dataMode?: "supabase" | "local";
}

export function AppNav({ user }: AppNavProps) {
  const pathname = usePathname();
  const router = useRouter();

  async function handleLogout() {
    const supabase = createSupabaseBrowserClient();
    if (supabase) {
      await supabase.auth.signOut();
    }
    router.push("/login");
    router.refresh();
  }

  const isManager = user?.role === "manager";

  const navItems = [
    {
      href: "/campo",
      label: isManager ? "Campo" : "Modo Campo",
      icon: ClipboardList,
      visible: true,
    },
    {
      href: "/planilha",
      label: "Planilha",
      icon: Table2,
      visible: isManager,
    },
    {
      href: "/dashboard",
      label: "Dashboard",
      icon: BarChart3,
      visible: isManager,
    },
    {
      href: "/configuracoes",
      label: "Configurações",
      icon: Settings,
      visible: isManager,
    },
  ].filter((item) => item.visible);

  return (
    <header className="border-b border-slate-200 bg-slate-900 text-white">
      <div className="mx-auto flex max-w-[1600px] items-center justify-between gap-3 px-4 py-2.5">
        <div className="flex items-center gap-4 min-w-0">
          <Link
            href={user?.role === "manager" ? "/planilha" : "/campo"}
            className="flex items-center gap-2 font-semibold tracking-tight text-white shrink-0"
          >
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-sky-500 text-xs font-bold text-slate-950">
              MD
            </span>
            <span className="hidden sm:inline text-sm">Medições Diárias</span>
          </Link>

          <nav className="flex items-center gap-1" aria-label="Navegação principal">
            {navItems.map((item) => {
              const active =
                pathname === item.href || pathname.startsWith(`${item.href}/`);
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs sm:text-sm font-medium transition-colors",
                    active
                      ? "bg-sky-600 text-white"
                      : "text-slate-300 hover:bg-slate-800 hover:text-white",
                  )}
                >
                  <Icon className="h-4 w-4" />
                  <span>{item.label}</span>
                </Link>
              );
            })}
          </nav>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {user ? (
            <div className="hidden md:flex items-center gap-1.5 rounded-full bg-slate-800 px-3 py-1 text-xs text-slate-200">
              <UserCheck className="h-3.5 w-3.5 text-sky-400" />
              <span className="max-w-[160px] truncate">{user.full_name}</span>
              <span className="rounded bg-slate-700 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-sky-300">
                {user.role === "manager" ? "Gestor" : "Técnico"}
              </span>
            </div>
          ) : null}

          <button
            type="button"
            onClick={handleLogout}
            title="Sair / Trocar usuário"
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-800 px-2.5 py-1.5 text-xs font-medium text-slate-200 hover:bg-slate-700 cursor-pointer"
          >
            <LogOut className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Sair</span>
          </button>
        </div>
      </div>
    </header>
  );
}
