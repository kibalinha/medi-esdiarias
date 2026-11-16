import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import ExcelJS from "exceljs";

// Mock next/headers cookies() so route handlers work cleanly in Vitest
const cookieValues = new Map<string, string>();
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => {
      const value = cookieValues.get(name);
      return value !== undefined ? { name, value } : undefined;
    },
    set: (name: string, value: string) => {
      cookieValues.set(name, value);
    },
    delete: (name: string) => {
      cookieValues.delete(name);
    },
  }),
}));

import { resetLocalDbForTests } from "@/lib/supabase/local-store";
import { GET as getAuthMe, POST as postAuthMe } from "@/app/api/auth/me/route";
import { GET as getBiMedicoes } from "@/app/api/bi/medicoes/route";
import { GET as getDashboard } from "@/app/api/dashboard/route";
import { GET as getCampoBootstrap } from "@/app/api/campo/bootstrap/route";
import { POST as postOcrExtract } from "@/app/api/ocr/extract/route";
import { POST as postSyncBatch } from "@/app/api/sync/batch/route";
import { GET as getPlanilha } from "@/app/api/planilha/route";
import {
  GET as getReadingReview,
  POST as postReadingReview,
} from "@/app/api/readings/review/route";
import { POST as postReadingCorrect } from "@/app/api/readings/correct/route";
import {
  GET as getCatalog,
  PATCH as patchCatalog,
} from "@/app/api/catalog/route";
import { GET as getAlerts, PATCH as patchAlerts } from "@/app/api/alerts/route";
import { GET as getExportXlsx } from "@/app/api/export/xlsx/route";
import { POST as postImportXlsx } from "@/app/api/import/xlsx/route";
import {
  GET as getPushConfig,
  POST as postPushSubscribe,
} from "@/app/api/notifications/push/route";

function makeReq(
  url: string,
  opts: {
    method?: string;
    role?: "technician" | "manager";
    body?: unknown;
  } = {},
): Request {
  const headers = new Headers();
  if (opts.role) {
    headers.set("x-local-role", opts.role);
  }
  if (opts.body !== undefined && !(opts.body instanceof FormData)) {
    headers.set("content-type", "application/json");
  }
  return new Request(`http://localhost:3000${url}`, {
    method: opts.method ?? "GET",
    headers,
    body:
      opts.body === undefined
        ? undefined
        : opts.body instanceof FormData
          ? opts.body
          : JSON.stringify(opts.body),
  });
}

describe("API Route Contracts & RBAC (Local Mode)", () => {
  beforeEach(() => {
    cookieValues.clear();
    resetLocalDbForTests();
  });

  it("GET/POST /api/auth/me manages local session and returns data_mode", async () => {
    const unauthRes = await getAuthMe(makeReq("/api/auth/me"));
    expect(unauthRes.status).toBe(200);
    const unauthBody = await unauthRes.json();
    expect(unauthBody).toEqual({ user: null, data_mode: "local" });

    const loginRes = await postAuthMe(
      makeReq("/api/auth/me", {
        method: "POST",
        body: { role: "technician" },
      }),
    );
    expect(loginRes.status).toBe(200);
    const loginBody = await loginRes.json();
    expect(loginBody.user.role).toBe("technician");
    expect(loginBody.data_mode).toBe("local");

    const meWithHeader = await getAuthMe(
      makeReq("/api/auth/me", { role: "manager" }),
    );
    const meBody = await meWithHeader.json();
    expect(meBody.user.role).toBe("manager");
  });

  it("enforces authentication (401) and manager RBAC (403) across protected routes", async () => {
    const noAuth = await getCampoBootstrap(makeReq("/api/campo/bootstrap"));
    expect(noAuth.status).toBe(401);

    const techCatalogPatch = await patchCatalog(
      makeReq("/api/catalog", {
        method: "PATCH",
        role: "technician",
        body: { group_updates: [] },
      }),
    );
    expect(techCatalogPatch.status).toBe(403);

    const techCorrect = await postReadingCorrect(
      makeReq("/api/readings/correct", {
        method: "POST",
        role: "technician",
        body: {
          reading_id: crypto.randomUUID(),
          new_value: 100,
          reason: "Teste RBAC",
        },
      }),
    );
    expect(techCorrect.status).toBe(403);

    const techCorrectByDate = await postReadingCorrect(
      makeReq("/api/readings/correct", {
        method: "POST",
        role: "technician",
        body: {
          reading_date: "2026-06-15",
          meter_code: "agua_hidrometro_geral",
          new_value: 100,
        },
      }),
    );
    expect(techCorrectByDate.status).toBe(403);

    const techReview = await postReadingReview(
      makeReq("/api/readings/review", {
        method: "POST",
        role: "technician",
        body: {
          reading_id: crypto.randomUUID(),
          action: "approve",
        },
      }),
    );
    expect(techReview.status).toBe(403);

    const techImport = await postImportXlsx(
      makeReq("/api/import/xlsx", {
        method: "POST",
        role: "technician",
        body: { file_base64: "AAAA", dry_run: true },
      }),
    );
    expect(techImport.status).toBe(403);

    const techAlertsPatch = await patchAlerts(
      makeReq("/api/alerts", {
        method: "PATCH",
        role: "technician",
        body: { alert_id: crypto.randomUUID(), acknowledge: true },
      }),
    );
    expect(techAlertsPatch.status).toBe(403);

    // Strict RBAC: Technician must receive 403 on Modo Planilha, Export, Catalog, Alerts, and Review GET
    const techPlanilha = await getPlanilha(
      makeReq("/api/planilha?year=2026", { role: "technician" }),
    );
    expect(techPlanilha.status).toBe(403);

    const techExport = await getExportXlsx(
      makeReq("/api/export/xlsx?year=2026", { role: "technician" }),
    );
    expect(techExport.status).toBe(403);

    const techCatalogGet = await getCatalog(
      makeReq("/api/catalog", { role: "technician" }),
    );
    expect(techCatalogGet.status).toBe(403);

    const techAlertsGet = await getAlerts(
      makeReq("/api/alerts", { role: "technician" }),
    );
    expect(techAlertsGet.status).toBe(403);

    const techReviewGet = await getReadingReview(
      makeReq(`/api/readings/review?reading_id=${crypto.randomUUID()}`, {
        role: "technician",
      }),
    );
    expect(techReviewGet.status).toBe(403);

    // Technician retains access to Field Mode endpoints
    const techBootstrap = await getCampoBootstrap(
      makeReq("/api/campo/bootstrap?date=2026-01-02", { role: "technician" }),
    );
    expect(techBootstrap.status).toBe(200);
  });

  it("GET /api/campo/bootstrap hides Chillers initially and reveals them when Manager activates in /api/catalog", async () => {
    const bootRes1 = await getCampoBootstrap(
      makeReq("/api/campo/bootstrap?date=2026-01-02", { role: "technician" }),
    );
    expect(bootRes1.status).toBe(200);
    const boot1 = await bootRes1.json();
    expect(boot1.groups.some((g: { slug: string }) => g.slug === "chiller_1")).toBe(false);
    expect(boot1.meters.some((m: { code: string }) => m.code.startsWith("chiller1_"))).toBe(false);
    expect(boot1.previous_readings.agua_hidrometro_geral.raw_value).toBe(243338);

    // Manager fetches catalog and activates Chiller 1 group + its meters
    const catRes = await getCatalog(makeReq("/api/catalog", { role: "manager" }));
    const cat = await catRes.json();
    const chiller1Group = cat.groups.find((g: { slug: string }) => g.slug === "chiller_1");
    const chiller1Meters = cat.meters.filter(
      (m: { group_slug: string }) => m.group_slug === "chiller_1",
    );

    const patchRes = await patchCatalog(
      makeReq("/api/catalog", {
        method: "PATCH",
        role: "manager",
        body: {
          group_updates: [{ id: chiller1Group.id, is_active_in_field: true }],
          meter_updates: chiller1Meters.map((m: { id: string }) => ({
            id: m.id,
            is_active_in_field: true,
          })),
        },
      }),
    );
    expect(patchRes.status).toBe(200);

    const bootRes2 = await getCampoBootstrap(
      makeReq("/api/campo/bootstrap?date=2026-01-02", { role: "technician" }),
    );
    const boot2 = await bootRes2.json();
    expect(boot2.groups.some((g: { slug: string }) => g.slug === "chiller_1")).toBe(true);
    expect(boot2.meters.filter((m: { code: string }) => m.code.startsWith("chiller1_"))).toHaveLength(6);
  });

  it("POST /api/ocr/extract returns mock structured OCR results when Gemini key is absent", async () => {
    const res = await postOcrExtract(
      makeReq("/api/ocr/extract", {
        method: "POST",
        role: "technician",
        body: {
          image_base64: Buffer.from("fake-webp-image").toString("base64"),
          mime_type: "image/webp",
          group_slug: "bss_1",
          meter_codes: ["bss1_consumo_fp", "bss1_consumo_p"],
          reading_date: "2026-01-02",
        },
      }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.is_mock).toBe(true);
    expect(body.ocr_status).toBe("processed");
    expect(body.results).toHaveLength(2);
    expect(body.results[0].meter_code).toBe("bss1_consumo_fp");
    expect(typeof body.results[0].extracted_value).toBe("number");
  });

  it("POST /api/sync/batch uploads N:M photos, deduplicates by client_mutation_id, triggers critical alerts, and supports review + correction audit", async () => {
    const mutationCondId = crypto.randomUUID();
    const mutationWaterId = crypto.randomUUID();
    const mutationBssDemandId = crypto.randomUUID();

    const payload = {
      photos: [
        {
          local_photo_id: "local-photo-1",
          data_base64: Buffer.from("photo-bytes").toString("base64"),
          mime_type: "image/webp",
          captured_at: "2026-01-02T10:00:00Z",
          group_slug: "cag",
          meter_codes: ["cag_condutivimetro"],
        },
      ],
      mutations: [
        {
          client_mutation_id: mutationCondId,
          reading_date: "2026-01-02",
          meter_code: "cag_condutivimetro",
          raw_value: 1080, // > 1000 => critical alert!
          input_source: "ocr",
          ocr_suggested_value: 1080,
          ocr_confidence: 0.94,
          local_photo_ids: ["local-photo-1"],
        },
        {
          client_mutation_id: mutationBssDemandId,
          reading_date: "2026-01-02",
          meter_code: "bss1_demanda_p",
          raw_value: 2600, // == teto 2600 => critical alert!
          input_source: "manual",
        },
        {
          client_mutation_id: mutationWaterId,
          reading_date: "2026-01-02",
          meter_code: "agua_reuso",
          raw_value: 4, // rollover 2788 -> 4 (or test rollover flag persisted)
          is_rollover: true,
          input_source: "manual",
        },
      ],
    };

    const syncRes1 = await postSyncBatch(
      makeReq("/api/sync/batch", {
        method: "POST",
        role: "technician",
        body: payload,
      }),
    );
    expect(syncRes1.status).toBe(200);
    const syncBody1 = await syncRes1.json();
    expect(syncBody1.failed).toHaveLength(0);
    expect(syncBody1.synced_photo_map["local-photo-1"]).toBeDefined();
    expect(syncBody1.results).toHaveLength(3);
    expect(syncBody1.results[0].is_duplicate_ignored).toBe(false);
    expect(syncBody1.results[0].status).toBe("pending_review");
    expect(syncBody1.results[0].alerts_triggered[0].rule_code).toBe("CONDUTIVIMETRO_CRITICO");
    expect(syncBody1.results[1].alerts_triggered[0].rule_code).toBe("DEMANDA_TETO");

    // Re-send same batch with same client_mutation_ids -> idempotent!
    const syncRes2 = await postSyncBatch(
      makeReq("/api/sync/batch", {
        method: "POST",
        role: "technician",
        body: { mutations: payload.mutations },
      }),
    );
    const syncBody2 = await syncRes2.json();
    expect(syncBody2.results.every((r: { is_duplicate_ignored: boolean }) => r.is_duplicate_ignored)).toBe(true);

    // Manager inspects reading in Planilha / InspectionDrawer
    const condReadingId = syncBody1.results[0].reading_id;
    const detailRes = await getReadingReview(
      makeReq(`/api/readings/review?reading_id=${condReadingId}`, {
        role: "manager",
      }),
    );
    expect(detailRes.status).toBe(200);
    const detail = await detailRes.json();
    expect(detail.photos).toHaveLength(1);
    expect(detail.audit_logs.length).toBeGreaterThanOrEqual(1);

    // Both critical alerts are active before correction
    const alertsBeforeRes = await getAlerts(
      makeReq("/api/alerts?acknowledged=false", { role: "manager" }),
    );
    expect(alertsBeforeRes.status).toBe(200);
    const alertsBeforeBody = await alertsBeforeRes.json();
    expect(alertsBeforeBody.alerts.length).toBeGreaterThanOrEqual(2);

    // Manager corrects reading with justification -> updates value, creates audit log, clears resolved alert
    const correctRes = await postReadingCorrect(
      makeReq("/api/readings/correct", {
        method: "POST",
        role: "manager",
        body: {
          reading_id: condReadingId,
          new_value: 680,
          reason: "Dígito lido incorretamente na foto",
        },
      }),
    );
    expect(correctRes.status).toBe(200);
    const correctBody = await correctRes.json();
    expect(correctBody.previous_value).toBe(1080);
    expect(correctBody.new_value).toBe(680);
    expect(correctBody.audit_log.action).toBe("update_value");
    expect(correctBody.alerts_triggered).toHaveLength(0);

    // Manager approves reading
    const approveRes = await postReadingReview(
      makeReq("/api/readings/review", {
        method: "POST",
        role: "manager",
        body: {
          reading_id: condReadingId,
          action: "approve",
        },
      }),
    );
    expect(approveRes.status).toBe(200);
    const approveBody = await approveRes.json();
    expect(approveBody.status).toBe("approved");

    // Alerts API supports both acknowledged=false and unacknowledged=1
    const unackRes = await getAlerts(
      makeReq("/api/alerts?unacknowledged=1", { role: "manager" }),
    );
    expect(unackRes.status).toBe(200);
    const unackBody = await unackRes.json();
    expect(unackBody.alerts.every((a: { acknowledged_at: string | null }) => a.acknowledged_at === null)).toBe(true);

    // Remaining critical alert (BSS1 demand) can be acknowledged
    const alertsRes = await getAlerts(
      makeReq("/api/alerts?acknowledged=false", { role: "manager" }),
    );
    expect(alertsRes.status).toBe(200);
    const alertsBody = await alertsRes.json();
    expect(alertsBody.alerts.length).toBeGreaterThanOrEqual(1);
    const ackRes = await patchAlerts(
      makeReq("/api/alerts", {
        method: "PATCH",
        role: "manager",
        body: { alert_id: alertsBody.alerts[0].id, acknowledge: true },
      }),
    );
    expect(ackRes.status).toBe(200);
  });

  it("GET /api/planilha and GET /api/export/xlsx return 91-column 365-day ascending (01/01 -> 31/12) grid and valid XLSX/CSV exports", async () => {
    const plan2025Res = await getPlanilha(
      makeReq("/api/planilha?year=2025", { role: "manager" }),
    );
    expect(plan2025Res.status).toBe(200);
    const plan2025 = await plan2025Res.json();
    expect(plan2025.columns).toHaveLength(91);
    expect(plan2025.rows).toHaveLength(365);
    expect(plan2025.rows[0].reading_date).toBe("2025-01-01");
    expect(plan2025.rows[364].reading_date).toBe("2025-12-31");
    const empty2025Row = plan2025.rows.find(
      (r: { reading_date: string }) => r.reading_date === "2025-07-15",
    );
    expect(empty2025Row.cells.agua_hidrometro_geral.value).toBeNull();

    const planRes = await getPlanilha(
      makeReq("/api/planilha?year=2026", { role: "manager" }),
    );
    expect(planRes.status).toBe(200);
    const plan = await planRes.json();
    expect(plan.columns).toHaveLength(91);
    expect(plan.rows).toHaveLength(365);
    expect(plan.rows[0].reading_date).toBe("2026-01-01");
    expect(plan.rows[364].reading_date).toBe("2026-12-31");

    const pendingPlanRes = await getPlanilha(
      makeReq("/api/planilha?year=2026&only_pending_or_alerts=1", { role: "manager" }),
    );
    expect(pendingPlanRes.status).toBe(200);
    const pendingPlan = await pendingPlanRes.json();
    expect(pendingPlan.rows.length).toBeLessThan(365);
    expect(pendingPlan.rows.every((r: { has_pending: boolean; highest_alert_severity: string | null }) => r.has_pending || r.highest_alert_severity !== null)).toBe(true);
    const pendingDates = pendingPlan.rows.map((r: { reading_date: string }) => r.reading_date);
    expect(pendingDates).toEqual([...pendingDates].sort((a, b) => a.localeCompare(b)));

    const xlsxRes = await getExportXlsx(
      makeReq("/api/export/xlsx?year=2026&format=xlsx", { role: "manager" }),
    );
    expect(xlsxRes.status).toBe(200);
    expect(xlsxRes.headers.get("content-type")).toContain("spreadsheetml.sheet");
    const arrBuf = await xlsxRes.arrayBuffer();
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(arrBuf);
    expect(wb.getWorksheet("2026")).toBeDefined();

    const csvRes = await getExportXlsx(
      makeReq("/api/export/xlsx?year=2026&format=csv", { role: "manager" }),
    );
    expect(csvRes.status).toBe(200);
    expect(csvRes.headers.get("content-type")).toContain("text/csv");
  });

  it("POST /api/readings/correct creates manual reading on empty date, recalculates deltas, and rejects non-input columns", async () => {
    const createPrev = await postReadingCorrect(
      makeReq("/api/readings/correct", {
        method: "POST",
        role: "manager",
        body: {
          reading_date: "2026-06-14",
          meter_code: "agua_hidrometro_geral",
          new_value: 255000,
          reason: "Lançamento manual na planilha",
        },
      }),
    );
    expect(createPrev.status).toBe(200);
    const prevBody = await createPrev.json();
    expect(prevBody.audit_log.action).toBe("create");
    expect(prevBody.new_value).toBe(255000);

    const createNext = await postReadingCorrect(
      makeReq("/api/readings/correct", {
        method: "POST",
        role: "manager",
        body: {
          reading_date: "2026-06-15",
          meter_code: "agua_hidrometro_geral",
          new_value: 255350,
        },
      }),
    );
    expect(createNext.status).toBe(200);
    const nextBody = await createNext.json();
    expect(nextBody.audit_log.action).toBe("create");

    const juneRes = await getPlanilha(
      makeReq("/api/planilha?year=2026&month=6", { role: "manager" }),
    );
    expect(juneRes.status).toBe(200);
    const junePlan = await juneRes.json();
    expect(junePlan.rows).toHaveLength(30);
    expect(junePlan.rows[0].reading_date).toBe("2026-06-01");
    expect(junePlan.rows[29].reading_date).toBe("2026-06-30");
    const jun15 = junePlan.rows.find(
      (r: { reading_date: string }) => r.reading_date === "2026-06-15",
    );
    expect(jun15.cells.agua_hidrometro_geral.value).toBe(255350);
    expect(jun15.cells.calc_agua_consumo_geral.value).toBe(350);

    // Updating the existing reading by (reading_date + meter_code) recalculates formulas
    const updateNext = await postReadingCorrect(
      makeReq("/api/readings/correct", {
        method: "POST",
        role: "manager",
        body: {
          reading_date: "2026-06-15",
          meter_code: "agua_hidrometro_geral",
          new_value: 255410,
          reason: "Ajuste manual na grade",
        },
      }),
    );
    expect(updateNext.status).toBe(200);
    const updateBody = await updateNext.json();
    expect(updateBody.audit_log.action).toBe("update_value");
    expect(updateBody.previous_value).toBe(255350);

    const juneUpdatedRes = await getPlanilha(
      makeReq("/api/planilha?year=2026&month=6", { role: "manager" }),
    );
    const juneUpdated = await juneUpdatedRes.json();
    const jun15Updated = juneUpdated.rows.find(
      (r: { reading_date: string }) => r.reading_date === "2026-06-15",
    );
    expect(jun15Updated.cells.calc_agua_consumo_geral.value).toBe(410);

    // Attempting to manually insert/edit CALCULATED, REFERENCE_YOY, or CONFIG columns must be refused
    const invalidCalc = await postReadingCorrect(
      makeReq("/api/readings/correct", {
        method: "POST",
        role: "manager",
        body: {
          reading_date: "2026-06-15",
          meter_code: "calc_agua_consumo_geral",
          new_value: 999,
        },
      }),
    );
    expect(invalidCalc.status).toBe(400);

    const invalidYoy = await postReadingCorrect(
      makeReq("/api/readings/correct", {
        method: "POST",
        role: "manager",
        body: {
          reading_date: "2026-06-15",
          meter_code: "yoy_agua_consumo_geral",
          new_value: 999,
        },
      }),
    );
    expect(invalidYoy.status).toBe(400);

    const invalidConfig = await postReadingCorrect(
      makeReq("/api/readings/correct", {
        method: "POST",
        role: "manager",
        body: {
          reading_date: "2026-06-15",
          meter_code: "cfg_bss1_teto_fp",
          new_value: 999,
        },
      }),
    );
    expect(invalidConfig.status).toBe(400);
  });

  it("POST /api/import/xlsx supports dry-run against real historical spreadsheet", async () => {
    const realXlsxPath =
      "C:/Users/luizf/.gemini/antigravity/brain/9ea36063-cfbf-4977-a6b6-199cfa5e1d59/.user_uploaded/media_1794775267125_2326a606.xlsx";
    if (!fs.existsSync(realXlsxPath)) return;

    const bytes = fs.readFileSync(realXlsxPath);
    const form = new FormData();
    form.append(
      "file",
      new Blob([bytes], {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      }),
      path.basename(realXlsxPath),
    );
    form.append("dry_run", "true");

    const res = await postImportXlsx(
      makeReq("/api/import/xlsx", {
        method: "POST",
        role: "manager",
        body: form,
      }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.dry_run).toBe(true);
    expect(body.sheets_processed).toEqual(expect.arrayContaining(["2025", "2026"]));
    expect(body.total_readings_imported).toBeGreaterThan(20000);
    expect(body.rollovers_detected).toBeGreaterThanOrEqual(1);
  });

  it("GET/POST /api/notifications/push stores manager push subscriptions", async () => {
    const getRes = await getPushConfig(
      makeReq("/api/notifications/push", { role: "manager" }),
    );
    expect(getRes.status).toBe(200);
    const getBody = await getRes.json();
    expect(getBody.subscribed).toBe(false);

    const postRes = await postPushSubscribe(
      makeReq("/api/notifications/push", {
        method: "POST",
        role: "manager",
        body: {
          endpoint: "https://push.example.com/sub-1",
          keys: { p256dh: "key-1", auth: "auth-1" },
        },
      }),
    );
    expect(postRes.status).toBe(200);
    const postBody = await postRes.json();
    expect(postBody.subscribed).toBe(true);
  });

  it("PATCH /api/catalog restricts visible field groups per technician login", async () => {
    const catRes = await getCatalog(makeReq("/api/catalog", { role: "manager" }));
    const cat = await catRes.json();
    const techUser = cat.users.find(
      (u: { role: string }) => u.role === "technician",
    );
    const aguaGroup = cat.groups.find(
      (g: { slug: string }) => g.slug === "agua",
    );
    expect(techUser).toBeTruthy();
    expect(aguaGroup).toBeTruthy();

    const patchRes = await patchCatalog(
      makeReq("/api/catalog", {
        method: "PATCH",
        role: "manager",
        body: {
          user_updates: [
            {
              id: techUser.id,
              restrict_groups: true,
              allowed_group_ids: [aguaGroup.id],
            },
          ],
        },
      }),
    );
    expect(patchRes.status).toBe(200);

    const bootRes = await getCampoBootstrap(
      makeReq("/api/campo/bootstrap?date=2026-01-02", { role: "technician" }),
    );
    expect(bootRes.status).toBe(200);
    const boot = await bootRes.json();
    expect(boot.groups).toHaveLength(1);
    expect(boot.groups[0].slug).toBe("agua");
    expect(
      boot.meters.every((m: { group_slug: string }) => m.group_slug === "agua"),
    ).toBe(true);
  });

  it("GET /api/bi/medicoes enforces BI_API_KEY and returns normalized JSON and wide CSV for Power BI", async () => {
    const prevKey = process.env.BI_API_KEY;
    process.env.BI_API_KEY = "test_bi_secret_123";
    try {
      const unauthRes = await getBiMedicoes(
        makeReq("/api/bi/medicoes?year=2026"),
      );
      expect(unauthRes.status).toBe(401);

      const jsonRes = await getBiMedicoes(
        makeReq("/api/bi/medicoes?api_key=test_bi_secret_123&year=2026"),
      );
      expect(jsonRes.status).toBe(200);
      const rows = await jsonRes.json();
      expect(Array.isArray(rows)).toBe(true);
      expect(rows.length).toBeGreaterThan(0);
      expect(rows[0]).toHaveProperty("medidor_codigo");
      expect(rows[0]).toHaveProperty("valor_bruto");
      expect(rows[0]).toHaveProperty("consumo_calculado");

      const csvRes = await getBiMedicoes(
        makeReq(
          "/api/bi/medicoes?api_key=test_bi_secret_123&year=2026&mode=wide&format=csv",
        ),
      );
      expect(csvRes.status).toBe(200);
      expect(csvRes.headers.get("content-type")).toContain("text/csv");
      const csvText = await csvRes.text();
      expect(csvText).toContain("data,ano,mes,dia");
    } finally {
      if (prevKey === undefined) delete process.env.BI_API_KEY;
      else process.env.BI_API_KEY = prevKey;
    }
  });

  it("GET /api/dashboard rejects technicians (403) and returns monthly & annual series for managers", async () => {
    const techRes = await getDashboard(
      makeReq("/api/dashboard?year=2026", { role: "technician" }),
    );
    expect(techRes.status).toBe(403);

    const mgrRes = await getDashboard(
      makeReq("/api/dashboard?year=2026", { role: "manager" }),
    );
    expect(mgrRes.status).toBe(200);
    const body = await mgrRes.json();
    expect(body.selected_year).toBe(2026);
    expect(body.monthly_series).toHaveLength(12);
    expect(Array.isArray(body.annual_series)).toBe(true);
    expect(body.energy_sector_shares.length).toBeGreaterThanOrEqual(4);
    expect(body.water_sector_shares.length).toBeGreaterThanOrEqual(4);

    const monthRes = await getDashboard(
      makeReq("/api/dashboard?year=2026&month=1", { role: "manager" }),
    );
    expect(monthRes.status).toBe(200);
    const monthBody = await monthRes.json();
    expect(monthBody.selected_month).toBe(1);
    expect(monthBody.daily_series).toHaveLength(31);
  });
});
