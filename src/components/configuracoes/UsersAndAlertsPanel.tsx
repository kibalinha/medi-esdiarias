"use client";

import * as React from "react";
import {
  Bell,
  BellRing,
  Check,
  Loader2,
  Shield,
  UserPlus,
  Users,
} from "lucide-react";
import type {
  AuthUserProfile,
  MeterGroupDto,
  PushConfigResponse,
  PushSubscribeRequest,
  UserRole,
} from "@/types/contracts";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

export function UsersAndAlertsPanel({
  users,
  groups,
  onUpdated,
}: {
  users: AuthUserProfile[];
  groups: MeterGroupDto[];
  onUpdated: () => void;
}) {
  const [pushConfig, setPushConfig] = React.useState<PushConfigResponse | null>(
    null,
  );
  const [pushBusy, setPushBusy] = React.useState(false);
  const [pushMessage, setPushMessage] = React.useState<string | null>(null);
  const [userBusyId, setUserBusyId] = React.useState<string | null>(null);
  const [userMessage, setUserMessage] = React.useState<string | null>(null);
  const [userError, setUserError] = React.useState<string | null>(null);

  // Estado local de seleção de setores por usuário
  const [draftGroupsByUser, setDraftGroupsByUser] = React.useState<
    Record<string, { restrict: boolean; groupIds: string[] }>
  >({});

  // Formulário de criação de novo login
  const [showCreateForm, setShowCreateForm] = React.useState(false);
  const [creating, setCreating] = React.useState(false);
  const [newName, setNewName] = React.useState("");
  const [newEmail, setNewEmail] = React.useState("");
  const [newPassword, setNewPassword] = React.useState("");
  const [newRole, setNewRole] = React.useState<UserRole>("technician");
  const [newRestrict, setNewRestrict] = React.useState(true);
  const [newGroupIds, setNewGroupIds] = React.useState<string[]>([]);

  React.useEffect(() => {
    const next: Record<string, { restrict: boolean; groupIds: string[] }> = {};
    for (const u of users) {
      next[u.id] = {
        restrict: Boolean(u.restrict_groups),
        groupIds: [...(u.allowed_group_ids ?? [])],
      };
    }
    setDraftGroupsByUser(next);
  }, [users]);

  React.useEffect(() => {
    fetch("/api/notifications/push", { cache: "no-store" })
      .then((res) => (res.ok ? res.json() : null))
      .then((data: PushConfigResponse | null) => {
        if (data) setPushConfig(data);
      })
      .catch(() => undefined);
  }, []);

  async function handleEnablePush() {
    setPushBusy(true);
    setPushMessage(null);
    try {
      if (!("Notification" in window) || !("serviceWorker" in navigator)) {
        throw new Error("Este navegador não suporta Web Push PWA.");
      }
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        throw new Error("Permissão de notificações negada no navegador.");
      }
      if (!pushConfig?.vapid_public_key) {
        throw new Error(
          "Chave VAPID não configurada no servidor. Alertas por e-mail continuam disponíveis.",
        );
      }

      const registration = await navigator.serviceWorker.ready;
      const appServerKey = urlBase64ToUint8Array(pushConfig.vapid_public_key);
      const sub = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: appServerKey.buffer as ArrayBuffer,
      });

      const subJson = sub.toJSON();
      if (!subJson.endpoint || !subJson.keys?.p256dh || !subJson.keys?.auth) {
        throw new Error("Inscrição Push incompleta.");
      }

      const payload: PushSubscribeRequest = {
        endpoint: subJson.endpoint,
        keys: {
          p256dh: subJson.keys.p256dh,
          auth: subJson.keys.auth,
        },
      };

      const res = await fetch("/api/notifications/push", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        throw new Error("Falha ao salvar inscrição Web Push no servidor.");
      }
      setPushConfig((prev) => (prev ? { ...prev, subscribed: true } : prev));
      setPushMessage("Web Push ativado para alertas críticos!");
    } catch (err) {
      setPushMessage(
        err instanceof Error ? err.message : "Erro ao ativar Web Push.",
      );
    } finally {
      setPushBusy(false);
    }
  }

  async function handleUpdateUser(
    user: AuthUserProfile,
    patch: {
      role?: UserRole;
      active?: boolean;
      restrict_groups?: boolean;
      allowed_group_ids?: string[];
    },
  ) {
    setUserBusyId(user.id);
    setUserError(null);
    setUserMessage(null);
    try {
      const res = await fetch("/api/catalog", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          user_updates: [{ id: user.id, ...patch }],
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => null);
        throw new Error(err?.error || "Erro ao atualizar usuário.");
      }
      setUserMessage(`Permissões de ${user.full_name} atualizadas.`);
      onUpdated();
    } catch (err) {
      setUserError(
        err instanceof Error ? err.message : "Erro ao atualizar usuário.",
      );
    } finally {
      setUserBusyId(null);
    }
  }

  function toggleDraftGroup(userId: string, groupId: string) {
    setDraftGroupsByUser((prev) => {
      const curr = prev[userId] ?? { restrict: true, groupIds: [] };
      const exists = curr.groupIds.includes(groupId);
      const nextIds = exists
        ? curr.groupIds.filter((id) => id !== groupId)
        : [...curr.groupIds, groupId];
      return {
        ...prev,
        [userId]: { ...curr, restrict: true, groupIds: nextIds },
      };
    });
  }

  async function handleCreateUser(e: React.FormEvent) {
    e.preventDefault();
    setCreating(true);
    setUserError(null);
    setUserMessage(null);
    try {
      const res = await fetch("/api/catalog", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          new_user: {
            full_name: newName.trim(),
            email: newEmail.trim(),
            password: newPassword,
            role: newRole,
            restrict_groups: newRole === "technician" ? newRestrict : false,
            allowed_group_ids:
              newRole === "technician" && newRestrict ? newGroupIds : [],
          },
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => null);
        throw new Error(err?.error || "Erro ao criar login.");
      }
      setNewName("");
      setNewEmail("");
      setNewPassword("");
      setNewGroupIds([]);
      setShowCreateForm(false);
      setUserMessage("Novo login criado com sucesso!");
      onUpdated();
    } catch (err) {
      setUserError(err instanceof Error ? err.message : "Erro ao criar login.");
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="space-y-4">
      {/* Web Push & Critical Alerts Config */}
      <Card>
        <CardHeader>
          <h2 className="flex items-center gap-1.5 text-sm font-bold text-slate-900">
            <BellRing className="h-4 w-4 text-rose-600" />
            Notificações Críticas (E-mail + Web Push PWA)
          </h2>
        </CardHeader>
        <CardContent className="space-y-3 text-xs text-slate-600">
          <p>
            Disparo automático para Gestores apenas em eventos críticos:{" "}
            <strong>Condutivímetro &gt; 1000</strong> ou{" "}
            <strong>Demanda BSS &ge; Teto</strong>.
          </p>

          <div className="flex flex-wrap items-center gap-2">
            <Badge variant={pushConfig?.subscribed ? "success" : "neutral"}>
              {pushConfig?.subscribed
                ? "Dispositivo inscrito no Web Push"
                : "Web Push não inscrito neste dispositivo"}
            </Badge>

            <Button
              size="sm"
              variant="outline"
              disabled={pushBusy}
              onClick={() => void handleEnablePush()}
            >
              {pushBusy ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Bell className="h-3.5 w-3.5" />
              )}
              Ativar Web Push neste dispositivo
            </Button>
          </div>

          {pushMessage ? (
            <p className="font-medium text-slate-800">{pushMessage}</p>
          ) : null}
        </CardContent>
      </Card>

      {/* Users & Sector Access Management */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-2">
          <div>
            <h2 className="flex items-center gap-1.5 text-sm font-bold text-slate-900">
              <Users className="h-4 w-4 text-indigo-600" />
              Usuários, Perfis e Setores por Login ({users.length})
            </h2>
            <p className="text-[11px] text-slate-500">
              Escolha quais setores cada técnico vê ao fazer login no Modo Campo.
            </p>
          </div>

          <Button
            size="sm"
            variant={showCreateForm ? "outline" : "primary"}
            onClick={() => setShowCreateForm((v) => !v)}
          >
            <UserPlus className="h-3.5 w-3.5" />
            {showCreateForm ? "Cancelar" : "Novo Login"}
          </Button>
        </CardHeader>

        <CardContent className="space-y-3">
          {userError ? (
            <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">
              {userError}
            </div>
          ) : null}
          {userMessage ? (
            <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-800">
              {userMessage}
            </div>
          ) : null}

          {showCreateForm ? (
            <form
              onSubmit={(e) => void handleCreateUser(e)}
              className="rounded-xl border border-indigo-200 bg-indigo-50/50 p-3 space-y-3 text-xs"
            >
              <div className="font-semibold text-indigo-950">
                Criar Novo Login de Acesso
              </div>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
                <Input
                  placeholder="Nome (ex.: Técnico Água)"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  required
                />
                <Input
                  type="email"
                  placeholder="E-mail de login"
                  value={newEmail}
                  onChange={(e) => setNewEmail(e.target.value)}
                  required
                />
                <Input
                  type="password"
                  placeholder="Senha (mín. 6 caracteres)"
                  minLength={6}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  required
                />
                <select
                  aria-label="Perfil do novo usuário"
                  value={newRole}
                  onChange={(e) => setNewRole(e.target.value as UserRole)}
                  className="h-9 rounded-md border border-slate-300 bg-white px-2 text-xs"
                >
                  <option value="technician">Técnico (só Modo Campo)</option>
                  <option value="manager">Gestor (acesso completo)</option>
                </select>
              </div>

              {newRole === "technician" ? (
                <div className="space-y-2 rounded-lg border border-indigo-200/80 bg-white p-2.5">
                  <div className="flex flex-wrap items-center gap-3">
                    <span className="font-medium text-slate-700">
                      Setores visíveis para este login:
                    </span>
                    <label className="flex items-center gap-1.5 cursor-pointer">
                      <input
                        type="radio"
                        checked={!newRestrict}
                        onChange={() => setNewRestrict(false)}
                      />
                      <span>Todos os setores</span>
                    </label>
                    <label className="flex items-center gap-1.5 cursor-pointer">
                      <input
                        type="radio"
                        checked={newRestrict}
                        onChange={() => setNewRestrict(true)}
                      />
                      <span>Somente setores selecionados</span>
                    </label>
                  </div>

                  {newRestrict ? (
                    <div className="flex flex-wrap gap-1.5 pt-1">
                      {groups.map((g) => {
                        const checked = newGroupIds.includes(g.id);
                        return (
                          <button
                            key={g.id}
                            type="button"
                            onClick={() =>
                              setNewGroupIds((prev) =>
                                checked
                                  ? prev.filter((id) => id !== g.id)
                                  : [...prev, g.id],
                              )
                            }
                            className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] font-medium transition ${
                              checked
                                ? "border-sky-600 bg-sky-600 text-white"
                                : "border-slate-300 bg-slate-50 text-slate-700 hover:bg-slate-100"
                            }`}
                          >
                            {checked ? <Check className="h-3 w-3" /> : null}
                            {g.name}
                          </button>
                        );
                      })}
                    </div>
                  ) : null}
                </div>
              ) : null}

              <div className="flex justify-end">
                <Button type="submit" size="sm" disabled={creating}>
                  {creating ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <UserPlus className="h-3.5 w-3.5" />
                  )}
                  Criar Usuário
                </Button>
              </div>
            </form>
          ) : null}

          {users.length === 0 ? (
            <p className="text-xs text-slate-500">
              Nenhum usuário listado neste ambiente.
            </p>
          ) : (
            users.map((u) => {
              const draft = draftGroupsByUser[u.id] ?? {
                restrict: Boolean(u.restrict_groups),
                groupIds: u.allowed_group_ids ?? [],
              };
              const isDirty =
                draft.restrict !== Boolean(u.restrict_groups) ||
                JSON.stringify([...draft.groupIds].sort()) !==
                  JSON.stringify([...(u.allowed_group_ids ?? [])].sort());

              return (
                <div
                  key={u.id}
                  className="rounded-lg border border-slate-200 p-3 text-xs space-y-2.5 bg-white"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5 font-semibold text-slate-900 truncate">
                        <span>{u.full_name}</span>
                        {u.role === "manager" ? (
                          <Badge variant="info">Gestor</Badge>
                        ) : (
                          <Badge variant="neutral">Técnico</Badge>
                        )}
                      </div>
                      <div className="text-[11px] text-slate-500 truncate">
                        {u.email || u.id}
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <select
                        aria-label={`Perfil de ${u.full_name}`}
                        disabled={userBusyId === u.id}
                        value={u.role}
                        onChange={(e) =>
                          void handleUpdateUser(u, {
                            role: e.target.value as UserRole,
                          })
                        }
                        className="h-8 rounded border border-slate-300 bg-white px-2 text-xs"
                      >
                        <option value="technician">Técnico</option>
                        <option value="manager">Gestor</option>
                      </select>

                      <Button
                        size="sm"
                        variant={u.active ? "outline" : "danger"}
                        disabled={userBusyId === u.id}
                        onClick={() =>
                          void handleUpdateUser(u, { active: !u.active })
                        }
                      >
                        {u.active ? "Ativo" : "Inativo"}
                      </Button>
                    </div>
                  </div>

                  {/* Setores visíveis para este login */}
                  <div className="rounded-md border border-slate-100 bg-slate-50 p-2.5 space-y-2">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex flex-wrap items-center gap-3">
                        <span className="inline-flex items-center gap-1 font-medium text-slate-700">
                          <Shield className="h-3.5 w-3.5 text-sky-600" />
                          Setores no Modo Campo:
                        </span>

                        <label className="flex items-center gap-1 cursor-pointer">
                          <input
                            type="radio"
                            name={`restrict-${u.id}`}
                            checked={!draft.restrict}
                            onChange={() =>
                              setDraftGroupsByUser((prev) => ({
                                ...prev,
                                [u.id]: {
                                  ...draft,
                                  restrict: false,
                                },
                              }))
                            }
                          />
                          <span>Todos os setores</span>
                        </label>

                        <label className="flex items-center gap-1 cursor-pointer">
                          <input
                            type="radio"
                            name={`restrict-${u.id}`}
                            checked={draft.restrict}
                            onChange={() =>
                              setDraftGroupsByUser((prev) => ({
                                ...prev,
                                [u.id]: {
                                  ...draft,
                                  restrict: true,
                                },
                              }))
                            }
                          />
                          <span>Somente selecionados ({draft.groupIds.length})</span>
                        </label>
                      </div>

                      {isDirty ? (
                        <Button
                          size="sm"
                          disabled={userBusyId === u.id}
                          onClick={() =>
                            void handleUpdateUser(u, {
                              restrict_groups: draft.restrict,
                              allowed_group_ids: draft.groupIds,
                            })
                          }
                        >
                          {userBusyId === u.id ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <Check className="h-3.5 w-3.5" />
                          )}
                          Salvar setores
                        </Button>
                      ) : null}
                    </div>

                    {draft.restrict ? (
                      <div className="flex flex-wrap gap-1.5 pt-1">
                        {groups.map((g) => {
                          const checked = draft.groupIds.includes(g.id);
                          return (
                            <button
                              key={g.id}
                              type="button"
                              disabled={userBusyId === u.id}
                              onClick={() => toggleDraftGroup(u.id, g.id)}
                              className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] font-medium transition ${
                                checked
                                  ? "border-sky-600 bg-sky-600 text-white"
                                  : "border-slate-300 bg-white text-slate-700 hover:bg-slate-100"
                              }`}
                            >
                              {checked ? <Check className="h-3 w-3" /> : null}
                              {g.name}
                              {!g.is_active_in_field ? " (inativo no campo)" : ""}
                            </button>
                          );
                        })}
                      </div>
                    ) : null}
                  </div>
                </div>
              );
            })
          )}
        </CardContent>
      </Card>
    </div>
  );
}
