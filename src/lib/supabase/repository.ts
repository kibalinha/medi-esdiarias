import crypto from "node:crypto";
import { evaluateCagWaterAnomaly, evaluateReadingAlerts } from "@/domain/alerts";
import { computeCumulativeDelta } from "@/domain/calculations";
import type { NormalizedReadingRecord } from "@/domain/spreadsheet";
import { dispatchCriticalNotifications } from "@/lib/notifications";
import { extractMeterReadings } from "@/lib/ocr";
import type {
  AlertDto,
  AuthUserProfile,
  CampoTodayReadingDto,
  CatalogResponse,
  CatalogUpdateRequest,
  CorrectReadingRequest,
  CorrectReadingResponse,
  MeterDto,
  MeterGroupDto,
  MeterThresholdDto,
  PreviousReadingRefDto,
  PushSubscribeRequest,
  ReadingAuditLogDto,
  ReadingDetailResponse,
  ReadingPhotoDto,
  ReadingStatus,
  ReviewReadingRequest,
  ReviewReadingResponse,
  SyncBatchRequest,
  SyncBatchResponse,
  SyncMutationResultDto,
} from "@/types/contracts";
import { getDataMode } from "./config";
import { getLocalDb, saveLocalDb, type LocalReadingRecord } from "./local-store";
import { createSupabaseAdminClient, createSupabaseServerClient } from "./server";
import { createPhotoSignedUrl, uploadFieldPhotoToStorage } from "./storage";

async function getSupabaseReader() {
  return (await createSupabaseServerClient()) ?? createSupabaseAdminClient();
}

function getSupabaseWriter() {
  return createSupabaseAdminClient();
}

export async function getCatalogData(): Promise<CatalogResponse> {
  if (getDataMode() === "local") {
    const db = getLocalDb();
    return {
      groups: [...db.groups].sort((a, b) => a.display_order - b.display_order),
      meters: [...db.meters].sort((a, b) => a.sort_order - b.sort_order),
      users: [...db.users],
    };
  }

  const supabase = await getSupabaseReader();
  if (!supabase) {
    throw new Error("Supabase client unavailable");
  }

  const [
    { data: groups, error: gErr },
    { data: meters, error: mErr },
    { data: thresholds },
    { data: profiles },
    { data: userGroups },
  ] = await Promise.all([
    supabase.from("meter_groups").select("*").order("display_order"),
    supabase.from("meters").select("*").order("sort_order"),
    supabase
      .from("meter_thresholds")
      .select("*")
      .order("effective_from", { ascending: false }),
    supabase.from("profiles").select("*").order("full_name"),
    supabase.from("user_meter_groups").select("user_id, group_id"),
  ]);

  if (gErr) throw new Error(gErr.message);
  if (mErr) throw new Error(mErr.message);

  const emailByUserId = new Map<string, string>();
  const adminClient = createSupabaseAdminClient();
  if (adminClient) {
    try {
      const { data: authUsers } = await adminClient.auth.admin.listUsers({
        perPage: 1000,
      });
      for (const au of authUsers?.users ?? []) {
        if (au.email) emailByUserId.set(au.id, au.email);
      }
    } catch {
      // ignore if service role cannot list auth users
    }
  }

  const allowedGroupsByUser = new Map<string, string[]>();
  for (const row of userGroups ?? []) {
    const arr = allowedGroupsByUser.get(row.user_id) ?? [];
    arr.push(row.group_id);
    allowedGroupsByUser.set(row.user_id, arr);
  }

  const groupSlugById = new Map((groups ?? []).map((g) => [g.id, g.slug]));
  const thresholdByMeterId = new Map<string, MeterThresholdDto>();
  for (const t of thresholds ?? []) {
    if (!thresholdByMeterId.has(t.meter_id)) {
      thresholdByMeterId.set(t.meter_id, {
        id: t.id,
        meter_id: t.meter_id,
        warning_min: t.warning_min,
        critical_min: t.critical_min,
        teto_value: t.teto_value,
        effective_from: t.effective_from,
        updated_by: t.updated_by,
        updated_at: t.updated_at,
      });
    }
  }

  const meterDtos: MeterDto[] = (meters ?? []).map((m) => ({
    id: m.id,
    group_id: m.group_id,
    group_slug: groupSlugById.get(m.group_id) ?? "",
    code: m.code,
    excel_header: m.excel_header,
    label: m.label,
    unit: m.unit,
    reading_kind: m.reading_kind,
    multiplier_factor: Number(m.multiplier_factor),
    dial_capacity: m.dial_capacity !== null ? Number(m.dial_capacity) : null,
    photo_required: m.photo_required,
    is_active_in_field: m.is_active_in_field,
    is_active_in_sheet: m.is_active_in_sheet,
    sort_order: m.sort_order,
    ocr_hint: m.ocr_hint,
    threshold: thresholdByMeterId.get(m.id) ?? null,
  }));

  const groupDtos: MeterGroupDto[] = (groups ?? []).map((g) => ({
    id: g.id,
    slug: g.slug,
    name: g.name,
    display_order: g.display_order,
    is_active_in_field: g.is_active_in_field,
    allow_batch_photo: g.allow_batch_photo,
  }));

  const userDtos: AuthUserProfile[] = (profiles ?? []).map((p) => ({
    id: p.id,
    email: emailByUserId.get(p.id) ?? "",
    full_name: p.full_name,
    role: p.role,
    active: p.active,
    restrict_groups: Boolean(p.restrict_groups),
    allowed_group_ids: allowedGroupsByUser.get(p.id) ?? [],
  }));

  return { groups: groupDtos, meters: meterDtos, users: userDtos };
}

export async function getPreviousReadingsBefore(
  targetDate: string,
  meters: MeterDto[],
): Promise<Record<string, PreviousReadingRefDto>> {
  const meterById = new Map(meters.map((m) => [m.id, m]));
  const result: Record<string, PreviousReadingRefDto> = {};

  if (getDataMode() === "local") {
    const db = getLocalDb();
    const sorted = db.readings
      .filter((r) => r.reading_date < targetDate)
      .sort((a, b) => b.reading_date.localeCompare(a.reading_date));

    for (const r of sorted) {
      const code = r.meter_code || meterById.get(r.meter_id)?.code;
      if (!code || result[code]) continue;
      result[code] = {
        meter_id: r.meter_id,
        meter_code: code,
        reading_date: r.reading_date,
        raw_value: Number(r.raw_value),
        is_rollover: r.is_rollover,
        is_meter_replaced: r.is_meter_replaced,
      };
    }
    return result;
  }

  const supabase = await getSupabaseReader();
  if (!supabase) return result;

  const { data } = await supabase
    .from("meter_readings")
    .select("meter_id, reading_date, raw_value, is_rollover, is_meter_replaced")
    .lt("reading_date", targetDate)
    .order("reading_date", { ascending: false })
    .limit(500);

  for (const r of data ?? []) {
    const m = meterById.get(r.meter_id);
    if (!m || result[m.code]) continue;
    result[m.code] = {
      meter_id: r.meter_id,
      meter_code: m.code,
      reading_date: r.reading_date,
      raw_value: Number(r.raw_value),
      is_rollover: r.is_rollover,
      is_meter_replaced: r.is_meter_replaced,
    };
  }
  return result;
}

export async function getReadingsForDate(
  targetDate: string,
  meters: MeterDto[],
): Promise<Record<string, CampoTodayReadingDto>> {
  const meterById = new Map(meters.map((m) => [m.id, m]));
  const result: Record<string, CampoTodayReadingDto> = {};

  if (getDataMode() === "local") {
    const db = getLocalDb();
    const dayReadings = db.readings.filter((r) => r.reading_date === targetDate);
    for (const r of dayReadings) {
      const code = r.meter_code || meterById.get(r.meter_id)?.code;
      if (!code) continue;
      const photoIds = db.readingPhotos
        .filter((rp) => rp.reading_id === r.id)
        .map((rp) => rp.photo_id);
      result[code] = {
        id: r.id,
        meter_id: r.meter_id,
        meter_code: code,
        reading_date: r.reading_date,
        raw_value: Number(r.raw_value),
        input_source: r.input_source,
        ocr_suggested_value: r.ocr_suggested_value,
        ocr_confidence: r.ocr_confidence,
        is_rollover: r.is_rollover,
        is_meter_replaced: r.is_meter_replaced,
        replacement_baseline: r.replacement_baseline,
        notes: r.notes,
        status: r.status,
        photo_ids: photoIds,
        client_mutation_id: r.client_mutation_id,
      };
    }
    return result;
  }

  const supabase = await getSupabaseReader();
  if (!supabase) return result;

  const { data } = await supabase
    .from("meter_readings")
    .select("*, reading_photos(photo_id)")
    .eq("reading_date", targetDate);

  for (const r of data ?? []) {
    const m = meterById.get(r.meter_id);
    if (!m) continue;
    const rpList = Array.isArray(r.reading_photos) ? r.reading_photos : [];
    result[m.code] = {
      id: r.id,
      meter_id: r.meter_id,
      meter_code: m.code,
      reading_date: r.reading_date,
      raw_value: Number(r.raw_value),
      input_source: r.input_source,
      ocr_suggested_value:
        r.ocr_suggested_value !== null ? Number(r.ocr_suggested_value) : null,
      ocr_confidence:
        r.ocr_confidence !== null ? Number(r.ocr_confidence) : null,
      is_rollover: r.is_rollover,
      is_meter_replaced: r.is_meter_replaced,
      replacement_baseline:
        r.replacement_baseline !== null ? Number(r.replacement_baseline) : null,
      notes: r.notes,
      status: r.status,
      photo_ids: rpList.map((p: { photo_id: string }) => p.photo_id),
      client_mutation_id: r.client_mutation_id,
    };
  }
  return result;
}

export async function getAllNormalizedReadingsAndPhotos(
  meters: MeterDto[],
): Promise<{
  readings: NormalizedReadingRecord[];
  photoCountByReadingId: Record<string, number>;
}> {
  const meterById = new Map(meters.map((m) => [m.id, m]));
  const photoCountByReadingId: Record<string, number> = {};

  if (getDataMode() === "local") {
    const db = getLocalDb();
    for (const rp of db.readingPhotos) {
      photoCountByReadingId[rp.reading_id] =
        (photoCountByReadingId[rp.reading_id] ?? 0) + 1;
    }
    const readings: NormalizedReadingRecord[] = db.readings
      .map((r) => {
        const m = meterById.get(r.meter_id);
        const code = r.meter_code || m?.code;
        if (!code) return null;
        return {
          id: r.id,
          reading_date: r.reading_date,
          meter_id: r.meter_id,
          meter_code: code,
          raw_value: Number(r.raw_value),
          input_source: r.input_source,
          ocr_confidence: r.ocr_confidence,
          is_rollover: r.is_rollover,
          is_meter_replaced: r.is_meter_replaced,
          replacement_baseline: r.replacement_baseline,
          status: r.status,
        };
      })
      .filter((x): x is NormalizedReadingRecord => x !== null);

    return { readings, photoCountByReadingId };
  }

  const supabase = await getSupabaseReader();
  if (!supabase) return { readings: [], photoCountByReadingId };

  // Fetch readings in pages if large
  const allRows: NormalizedReadingRecord[] = [];
  let from = 0;
  const pageSize = 1000;

  while (true) {
    const { data, error } = await supabase
      .from("meter_readings")
      .select(
        "id, reading_date, meter_id, raw_value, input_source, ocr_confidence, is_rollover, is_meter_replaced, replacement_baseline, status",
      )
      .order("reading_date", { ascending: true })
      .range(from, from + pageSize - 1);

    if (error) throw new Error(error.message);
    if (!data || data.length === 0) break;

    for (const r of data) {
      const m = meterById.get(r.meter_id);
      if (!m) continue;
      allRows.push({
        id: r.id,
        reading_date: r.reading_date,
        meter_id: r.meter_id,
        meter_code: m.code,
        raw_value: Number(r.raw_value),
        input_source: r.input_source,
        ocr_confidence:
          r.ocr_confidence !== null ? Number(r.ocr_confidence) : null,
        is_rollover: r.is_rollover,
        is_meter_replaced: r.is_meter_replaced,
        replacement_baseline:
          r.replacement_baseline !== null
            ? Number(r.replacement_baseline)
            : null,
        status: r.status,
      });
    }

    if (data.length < pageSize) break;
    from += pageSize;
  }

  const { data: rpRows } = await supabase
    .from("reading_photos")
    .select("reading_id");
  for (const rp of rpRows ?? []) {
    photoCountByReadingId[rp.reading_id] =
      (photoCountByReadingId[rp.reading_id] ?? 0) + 1;
  }

  return { readings: allRows, photoCountByReadingId };
}

export async function listAlerts(params?: {
  severity?: "warning" | "critical";
  acknowledged?: boolean;
  limit?: number;
}): Promise<AlertDto[]> {
  const catalog = await getCatalogData();
  const meterById = new Map(catalog.meters.map((m) => [m.id, m]));

  if (getDataMode() === "local") {
    const db = getLocalDb();
    let list = [...db.alerts].sort((a, b) =>
      b.created_at.localeCompare(a.created_at),
    );
    if (params?.severity) {
      list = list.filter((a) => a.severity === params.severity);
    }
    if (params?.acknowledged !== undefined) {
      list = list.filter((a) =>
        params.acknowledged ? a.acknowledged_at !== null : a.acknowledged_at === null,
      );
    }
    if (params?.limit) {
      list = list.slice(0, params.limit);
    }
    return list;
  }

  const supabase = await getSupabaseReader();
  if (!supabase) return [];

  let query = supabase
    .from("alerts")
    .select("*")
    .order("created_at", { ascending: false });

  if (params?.severity) query = query.eq("severity", params.severity);
  if (params?.acknowledged === true) {
    query = query.not("acknowledged_at", "is", null);
  } else if (params?.acknowledged === false) {
    query = query.is("acknowledged_at", null);
  }
  if (params?.limit) query = query.limit(params.limit);

  const { data } = await query;
  return (data ?? []).map((a) => {
    const m = meterById.get(a.meter_id);
    return {
      id: a.id,
      reading_id: a.reading_id,
      reading_date: a.reading_date,
      meter_id: a.meter_id,
      meter_code: m?.code ?? "",
      meter_label: m?.label ?? "",
      severity: a.severity,
      rule_code: a.rule_code,
      message: a.message,
      acknowledged_by: a.acknowledged_by,
      acknowledged_at: a.acknowledged_at,
      notified_email: a.notified_email,
      notified_push: a.notified_push,
      created_at: a.created_at,
    };
  });
}

export async function getReadingDetail(
  readingId: string,
): Promise<ReadingDetailResponse | null> {
  const catalog = await getCatalogData();
  const meterById = new Map(catalog.meters.map((m) => [m.id, m]));

  if (getDataMode() === "local") {
    const db = getLocalDb();
    const r = db.readings.find((item) => item.id === readingId);
    if (!r) return null;
    const meter = meterById.get(r.meter_id);
    if (!meter) return null;

    const prevMap = await getPreviousReadingsBefore(
      r.reading_date,
      catalog.meters,
    );
    const linkedPhotoIds = db.readingPhotos
      .filter((rp) => rp.reading_id === r.id)
      .map((rp) => rp.photo_id);

    const photos: ReadingPhotoDto[] = db.photos
      .filter((p) => linkedPhotoIds.includes(p.id))
      .map((p) => ({
        id: p.id,
        storage_path: p.storage_path,
        signed_url: p.data_url,
        captured_at: p.captured_at,
        ocr_status: p.ocr_status,
        ocr_raw_response: p.ocr_raw_response,
      }));

    const auditLogs = db.auditLogs
      .filter((l) => l.reading_id === r.id)
      .sort((a, b) => b.created_at.localeCompare(a.created_at));

    const alerts = db.alerts.filter((a) => a.reading_id === r.id);
    const userById = new Map(db.users.map((u) => [u.id, u]));

    return {
      reading: {
        id: r.id,
        meter_id: r.meter_id,
        meter_code: meter.code,
        reading_date: r.reading_date,
        raw_value: Number(r.raw_value),
        input_source: r.input_source,
        ocr_suggested_value: r.ocr_suggested_value,
        ocr_confidence: r.ocr_confidence,
        is_rollover: r.is_rollover,
        is_meter_replaced: r.is_meter_replaced,
        replacement_baseline: r.replacement_baseline,
        notes: r.notes,
        status: r.status,
        photo_ids: linkedPhotoIds,
        client_mutation_id: r.client_mutation_id,
        created_by: r.created_by,
        created_by_name: r.created_by
          ? (userById.get(r.created_by)?.full_name ?? null)
          : null,
        reviewed_by: r.reviewed_by,
        reviewed_by_name: r.reviewed_by
          ? (userById.get(r.reviewed_by)?.full_name ?? null)
          : null,
        reviewed_at: r.reviewed_at,
      },
      meter,
      previous_reading: prevMap[meter.code] ?? null,
      photos,
      audit_logs: auditLogs,
      alerts,
    };
  }

  const supabase = await getSupabaseReader();
  if (!supabase) return null;

  const { data: r, error } = await supabase
    .from("meter_readings")
    .select("*")
    .eq("id", readingId)
    .single();
  if (error || !r) return null;

  const meter = meterById.get(r.meter_id);
  if (!meter) return null;

  const [{ data: rpRows }, { data: logs }, { data: alertRows }, { data: profiles }, prevMap] =
    await Promise.all([
      supabase
        .from("reading_photos")
        .select("photo_id, field_photos(*)")
        .eq("reading_id", readingId),
      supabase
        .from("reading_audit_logs")
        .select("*")
        .eq("reading_id", readingId)
        .order("created_at", { ascending: false }),
      supabase.from("alerts").select("*").eq("reading_id", readingId),
      supabase.from("profiles").select("id, full_name"),
      getPreviousReadingsBefore(r.reading_date, catalog.meters),
    ]);

  const nameById = new Map((profiles ?? []).map((p) => [p.id, p.full_name]));

  const photos: ReadingPhotoDto[] = [];
  const photoIds: string[] = [];
  for (const row of rpRows ?? []) {
    const rawFp = (row as { field_photos?: unknown }).field_photos;
    const fpList = Array.isArray(rawFp) ? rawFp : rawFp ? [rawFp] : [];
    for (const item of fpList) {
      const fp = item as {
        id: string;
        storage_path: string;
        captured_at: string;
        ocr_status: "pending" | "processed" | "failed" | "skipped";
        ocr_raw_response: unknown;
      };
      photoIds.push(fp.id);
      const signedUrl = await createPhotoSignedUrl(fp.storage_path);
      photos.push({
        id: fp.id,
        storage_path: fp.storage_path,
        signed_url: signedUrl,
        captured_at: fp.captured_at,
        ocr_status: fp.ocr_status,
        ocr_raw_response: fp.ocr_raw_response,
      });
    }
  }

  const auditLogs: ReadingAuditLogDto[] = (logs ?? []).map((l) => ({
    id: l.id,
    reading_id: l.reading_id,
    actor_id: l.actor_id,
    actor_name: l.actor_id ? (nameById.get(l.actor_id) ?? null) : null,
    action: l.action,
    previous_value: l.previous_value !== null ? Number(l.previous_value) : null,
    new_value: l.new_value !== null ? Number(l.new_value) : null,
    reason: l.reason,
    created_at: l.created_at,
  }));

  const alerts: AlertDto[] = (alertRows ?? []).map((a) => ({
    id: a.id,
    reading_id: a.reading_id,
    reading_date: a.reading_date,
    meter_id: a.meter_id,
    meter_code: meter.code,
    meter_label: meter.label,
    severity: a.severity,
    rule_code: a.rule_code,
    message: a.message,
    acknowledged_by: a.acknowledged_by,
    acknowledged_at: a.acknowledged_at,
    notified_email: a.notified_email,
    notified_push: a.notified_push,
    created_at: a.created_at,
  }));

  return {
    reading: {
      id: r.id,
      meter_id: r.meter_id,
      meter_code: meter.code,
      reading_date: r.reading_date,
      raw_value: Number(r.raw_value),
      input_source: r.input_source,
      ocr_suggested_value:
        r.ocr_suggested_value !== null ? Number(r.ocr_suggested_value) : null,
      ocr_confidence:
        r.ocr_confidence !== null ? Number(r.ocr_confidence) : null,
      is_rollover: r.is_rollover,
      is_meter_replaced: r.is_meter_replaced,
      replacement_baseline:
        r.replacement_baseline !== null ? Number(r.replacement_baseline) : null,
      notes: r.notes,
      status: r.status,
      photo_ids: photoIds,
      client_mutation_id: r.client_mutation_id,
      created_by: r.created_by,
      created_by_name: r.created_by ? (nameById.get(r.created_by) ?? null) : null,
      reviewed_by: r.reviewed_by,
      reviewed_by_name: r.reviewed_by
        ? (nameById.get(r.reviewed_by) ?? null)
        : null,
      reviewed_at: r.reviewed_at,
    },
    meter,
    previous_reading: prevMap[meter.code] ?? null,
    photos,
    audit_logs: auditLogs,
    alerts,
  };
}

export async function reviewReading(
  req: ReviewReadingRequest,
  actor: AuthUserProfile,
): Promise<ReviewReadingResponse> {
  const newStatus: ReadingStatus =
    req.action === "approve" ? "approved" : "flagged";
  const nowIso = new Date().toISOString();

  if (getDataMode() === "local") {
    const db = getLocalDb();
    const reading = db.readings.find((r) => r.id === req.reading_id);
    if (!reading) {
      throw new Error("Leitura não encontrada.");
    }
    reading.status = newStatus;
    reading.reviewed_by = actor.id;
    reading.reviewed_at = nowIso;
    reading.updated_at = nowIso;

    const audit: ReadingAuditLogDto = {
      id: crypto.randomUUID(),
      reading_id: reading.id,
      actor_id: actor.id,
      actor_name: actor.full_name,
      action: req.action === "approve" ? "approve" : "flag",
      previous_value: reading.raw_value,
      new_value: reading.raw_value,
      reason: req.reason ?? null,
      created_at: nowIso,
    };
    db.auditLogs.push(audit);
    saveLocalDb(db);

    return {
      reading_id: reading.id,
      status: newStatus,
      reviewed_by: actor.id,
      reviewed_at: nowIso,
      audit_log: audit,
    };
  }

  const supabase = getSupabaseWriter() ?? (await getSupabaseReader());
  if (!supabase) throw new Error("Supabase unavailable");

  const { data: existing, error: fetchErr } = await supabase
    .from("meter_readings")
    .select("id, raw_value")
    .eq("id", req.reading_id)
    .single();
  if (fetchErr || !existing) {
    throw new Error("Leitura não encontrada.");
  }

  const { error: updErr } = await supabase
    .from("meter_readings")
    .update({
      status: newStatus,
      reviewed_by: actor.id,
      reviewed_at: nowIso,
    })
    .eq("id", req.reading_id);
  if (updErr) throw new Error(updErr.message);

  const { data: logRow } = await supabase
    .from("reading_audit_logs")
    .insert({
      reading_id: req.reading_id,
      actor_id: actor.id,
      action: req.action === "approve" ? "approve" : "flag",
      previous_value: existing.raw_value,
      new_value: existing.raw_value,
      reason: req.reason ?? null,
    })
    .select("*")
    .single();

  return {
    reading_id: req.reading_id,
    status: newStatus,
    reviewed_by: actor.id,
    reviewed_at: nowIso,
    audit_log: {
      id: logRow?.id ?? crypto.randomUUID(),
      reading_id: req.reading_id,
      actor_id: actor.id,
      actor_name: actor.full_name,
      action: req.action === "approve" ? "approve" : "flag",
      previous_value: Number(existing.raw_value),
      new_value: Number(existing.raw_value),
      reason: req.reason ?? null,
      created_at: logRow?.created_at ?? nowIso,
    },
  };
}

export async function correctReading(
  req: CorrectReadingRequest,
  actor: AuthUserProfile,
): Promise<CorrectReadingResponse> {
  const value = req.new_value ?? req.raw_value;
  if (value === undefined || !Number.isFinite(value)) {
    throw new Error("Valor numérico obrigatório (new_value ou raw_value).");
  }
  const reason =
    req.reason?.trim() || "Lançamento/correção manual pelo gestor no Modo Planilha";

  const catalog = await getCatalogData();
  const meterById = new Map(catalog.meters.map((m) => [m.id, m]));
  const meterByCode = new Map(catalog.meters.map((m) => [m.code, m]));
  const nowIso = new Date().toISOString();

  if (getDataMode() === "local") {
    const db = getLocalDb();
    let reading: LocalReadingRecord | undefined;
    let meter: MeterDto | undefined;

    if (req.reading_id) {
      reading = db.readings.find((r) => r.id === req.reading_id);
      if (!reading) {
        throw new Error("Leitura não encontrada.");
      }
      meter = meterById.get(reading.meter_id);
    } else if (req.reading_date && req.meter_code) {
      meter = meterByCode.get(req.meter_code);
      if (!meter) {
        throw new Error(
          "Somente campos de entrada bruta (INPUT) podem ser editados manualmente.",
        );
      }
      reading = db.readings.find(
        (r) => r.reading_date === req.reading_date && r.meter_id === meter!.id,
      );
    } else {
      throw new Error(
        "Informe reading_id ou (reading_date + meter_code) para lançar/corrigir.",
      );
    }

    if (!meter) {
      throw new Error(
        "Medidor não pertence ao catálogo de entradas brutas (INPUT).",
      );
    }

    let previousValue: number | null = null;
    let action: "create" | "update_value" = "create";

    if (reading) {
      previousValue = reading.raw_value;
      action = "update_value";
      reading.raw_value = value;
      if (req.is_rollover !== undefined) reading.is_rollover = req.is_rollover;
      if (req.is_meter_replaced !== undefined) {
        reading.is_meter_replaced = req.is_meter_replaced;
      }
      if (req.replacement_baseline !== undefined) {
        reading.replacement_baseline = req.replacement_baseline;
      }
      reading.status = "approved";
      reading.reviewed_by = actor.id;
      reading.reviewed_at = nowIso;
      reading.updated_at = nowIso;
    } else {
      reading = {
        id: crypto.randomUUID(),
        reading_date: req.reading_date!,
        meter_id: meter.id,
        meter_code: meter.code,
        raw_value: value,
        input_source: "manual",
        ocr_suggested_value: null,
        ocr_confidence: null,
        is_rollover: Boolean(req.is_rollover),
        is_meter_replaced: Boolean(req.is_meter_replaced),
        replacement_baseline: req.replacement_baseline ?? null,
        notes: reason,
        status: "approved",
        created_by: actor.id,
        reviewed_by: actor.id,
        reviewed_at: nowIso,
        client_mutation_id: null,
        created_at: nowIso,
        updated_at: nowIso,
      };
      db.readings.push(reading);
    }

    const audit: ReadingAuditLogDto = {
      id: crypto.randomUUID(),
      reading_id: reading.id,
      actor_id: actor.id,
      actor_name: actor.full_name,
      action,
      previous_value: previousValue,
      new_value: value,
      reason,
      created_at: nowIso,
    };
    db.auditLogs.push(audit);

    // Re-evaluate alerts for this reading
    const prevMap = await getPreviousReadingsBefore(
      reading.reading_date,
      catalog.meters,
    );
    const prevRef = prevMap[meter.code];
    let isDropWithoutFlag = false;
    if (meter.reading_kind === "cumulative" && prevRef) {
      const deltaRes = computeCumulativeDelta({
        currentValue: value,
        previousValue: prevRef.raw_value,
        currentDate: reading.reading_date,
        previousDate: prevRef.reading_date,
        multiplierFactor: meter.multiplier_factor,
        dialCapacity: meter.dial_capacity,
        isRollover: reading.is_rollover,
        isMeterReplaced: reading.is_meter_replaced,
        replacementBaseline: reading.replacement_baseline,
      });
      isDropWithoutFlag = deltaRes.isDropWithoutFlag;
    }

    const evalRes = evaluateReadingAlerts({
      meter,
      rawValue: value,
      previousValue: prevRef?.raw_value ?? null,
      isDropWithoutFlag,
    });

    // Replace alerts for this reading
    db.alerts = db.alerts.filter((a) => a.reading_id !== reading!.id);
    const triggered: AlertDto[] = evalRes.alerts.map((a) => ({
      id: crypto.randomUUID(),
      reading_id: reading!.id,
      reading_date: reading!.reading_date,
      meter_id: meter!.id,
      meter_code: meter!.code,
      meter_label: meter!.label,
      severity: a.severity,
      rule_code: a.rule_code,
      message: a.message,
      acknowledged_by: null,
      acknowledged_at: null,
      notified_email: false,
      notified_push: false,
      created_at: nowIso,
    }));
    db.alerts.push(...triggered);
    saveLocalDb(db);

    return {
      reading_id: reading.id,
      meter_code: meter.code,
      reading_date: reading.reading_date,
      previous_value: previousValue,
      new_value: value,
      status: reading.status,
      audit_log: audit,
      alerts_triggered: triggered,
    };
  }

  const supabase = getSupabaseWriter() ?? (await getSupabaseReader());
  if (!supabase) throw new Error("Supabase unavailable");

  let existing: {
    id: string;
    reading_date: string;
    meter_id: string;
    raw_value: number;
    is_rollover: boolean;
    is_meter_replaced: boolean;
    replacement_baseline: number | null;
  } | null = null;
  let meter: MeterDto | undefined;

  if (req.reading_id) {
    const { data, error: fetchErr } = await supabase
      .from("meter_readings")
      .select("*")
      .eq("id", req.reading_id)
      .single();
    if (fetchErr || !data) throw new Error("Leitura não encontrada.");
    existing = data;
    meter = meterById.get(data.meter_id);
  } else if (req.reading_date && req.meter_code) {
    meter = meterByCode.get(req.meter_code);
    if (!meter) {
      throw new Error(
        "Somente campos de entrada bruta (INPUT) podem ser editados manualmente.",
      );
    }
    const { data } = await supabase
      .from("meter_readings")
      .select("*")
      .eq("reading_date", req.reading_date)
      .eq("meter_id", meter.id)
      .maybeSingle();
    existing = data ?? null;
  } else {
    throw new Error(
      "Informe reading_id ou (reading_date + meter_code) para lançar/corrigir.",
    );
  }

  if (!meter) {
    throw new Error("Medidor não pertence ao catálogo de entradas brutas.");
  }

  const targetDate = existing ? existing.reading_date : req.reading_date!;
  const prevValue = existing ? Number(existing.raw_value) : null;
  const action: "create" | "update_value" = existing ? "update_value" : "create";

  let readingId: string;
  const effectiveRollover =
    req.is_rollover ?? existing?.is_rollover ?? false;
  const effectiveReplaced =
    req.is_meter_replaced ?? existing?.is_meter_replaced ?? false;
  const effectiveBaseline =
    req.replacement_baseline !== undefined
      ? req.replacement_baseline
      : (existing?.replacement_baseline ?? null);

  if (existing) {
    const { error: updErr } = await supabase
      .from("meter_readings")
      .update({
        raw_value: value,
        is_rollover: effectiveRollover,
        is_meter_replaced: effectiveReplaced,
        replacement_baseline: effectiveBaseline,
        status: "approved",
        reviewed_by: actor.id,
        reviewed_at: nowIso,
      })
      .eq("id", existing.id);
    if (updErr) throw new Error(updErr.message);
    readingId = existing.id;
  } else {
    const { data: inserted, error: insErr } = await supabase
      .from("meter_readings")
      .insert({
        reading_date: targetDate,
        meter_id: meter.id,
        raw_value: value,
        input_source: "manual",
        is_rollover: effectiveRollover,
        is_meter_replaced: effectiveReplaced,
        replacement_baseline: effectiveBaseline,
        notes: reason,
        status: "approved",
        created_by: actor.id,
        reviewed_by: actor.id,
        reviewed_at: nowIso,
      })
      .select("id")
      .single();
    if (insErr || !inserted) {
      throw new Error(insErr?.message ?? "Erro ao inserir leitura manual.");
    }
    readingId = inserted.id;
  }

  const { data: logRow } = await supabase
    .from("reading_audit_logs")
    .insert({
      reading_id: readingId,
      actor_id: actor.id,
      action,
      previous_value: prevValue,
      new_value: value,
      reason,
    })
    .select("*")
    .single();

  const prevMap = await getPreviousReadingsBefore(targetDate, catalog.meters);
  const prevRef = prevMap[meter.code];
  let isDropWithoutFlag = false;
  if (meter.reading_kind === "cumulative" && prevRef) {
    const deltaRes = computeCumulativeDelta({
      currentValue: value,
      previousValue: prevRef.raw_value,
      currentDate: targetDate,
      previousDate: prevRef.reading_date,
      multiplierFactor: meter.multiplier_factor,
      dialCapacity: meter.dial_capacity,
      isRollover: effectiveRollover,
      isMeterReplaced: effectiveReplaced,
      replacementBaseline: effectiveBaseline,
    });
    isDropWithoutFlag = deltaRes.isDropWithoutFlag;
  }

  const evalRes = evaluateReadingAlerts({
    meter,
    rawValue: value,
    previousValue: prevRef?.raw_value ?? null,
    isDropWithoutFlag,
  });

  await supabase.from("alerts").delete().eq("reading_id", readingId);
  const triggered: AlertDto[] = [];
  for (const a of evalRes.alerts) {
    const { data: insertedAlert } = await supabase
      .from("alerts")
      .insert({
        reading_id: readingId,
        reading_date: targetDate,
        meter_id: meter.id,
        severity: a.severity,
        rule_code: a.rule_code,
        message: a.message,
      })
      .select("*")
      .single();
    if (insertedAlert) {
      triggered.push({
        id: insertedAlert.id,
        reading_id: insertedAlert.reading_id,
        reading_date: insertedAlert.reading_date,
        meter_id: insertedAlert.meter_id,
        meter_code: meter.code,
        meter_label: meter.label,
        severity: insertedAlert.severity,
        rule_code: insertedAlert.rule_code,
        message: insertedAlert.message,
        acknowledged_by: insertedAlert.acknowledged_by,
        acknowledged_at: insertedAlert.acknowledged_at,
        notified_email: insertedAlert.notified_email,
        notified_push: insertedAlert.notified_push,
        created_at: insertedAlert.created_at,
      });
    }
  }

  return {
    reading_id: readingId,
    meter_code: meter.code,
    reading_date: targetDate,
    previous_value: prevValue,
    new_value: value,
    status: "approved",
    audit_log: {
      id: logRow?.id ?? crypto.randomUUID(),
      reading_id: readingId,
      actor_id: actor.id,
      actor_name: actor.full_name,
      action,
      previous_value: prevValue,
      new_value: value,
      reason,
      created_at: logRow?.created_at ?? nowIso,
    },
    alerts_triggered: triggered,
  };
}

export async function syncBatchMutations(
  req: SyncBatchRequest,
  actor: AuthUserProfile,
): Promise<SyncBatchResponse> {
  const catalog = await getCatalogData();
  const meterByCode = new Map(catalog.meters.map((m) => [m.code, m]));
  const meterById = new Map(catalog.meters.map((m) => [m.id, m]));
  const syncedPhotoMap: Record<string, string> = {};
  const deferredOcrByPhotoId = new Map<string, Record<string, { value: number | null; confidence: number }>>();

  // 1. Upload pending offline photos first + run deferred OCR if requested
  for (const photo of req.photos ?? []) {
    const photoId = crypto.randomUUID();
    const ext = photo.mime_type.includes("png")
      ? "png"
      : photo.mime_type.includes("jpeg") || photo.mime_type.includes("jpg")
        ? "jpg"
        : "webp";
    const datePrefix = (photo.captured_at || new Date().toISOString())
      .slice(0, 10)
      .replace(/-/g, "/");
    const storagePath = `${datePrefix}/${photoId}.${ext}`;
    const cleanBase64 = photo.data_base64.replace(/^data:[^;]+;base64,/, "");
    const buffer = Buffer.from(cleanBase64, "base64");

    await uploadFieldPhotoToStorage({
      storagePath,
      buffer,
      contentType: photo.mime_type || "image/webp",
    });

    let ocrStatus: "pending" | "processed" | "failed" | "skipped" = "skipped";
    let ocrRaw: unknown = null;

    if (photo.run_ocr) {
      const targetMeters = (photo.meter_codes ?? [])
        .map((c) => meterByCode.get(c))
        .filter((m): m is MeterDto => Boolean(m));
      if (targetMeters.length > 0) {
        try {
          const ocrOut = await extractMeterReadings({
            imageBase64: cleanBase64,
            mimeType: photo.mime_type || "image/webp",
            groupSlug: photo.group_slug || targetMeters[0].group_slug,
            meters: targetMeters.map((m) => ({ meter: m })),
          });
          ocrStatus = "processed";
          ocrRaw = ocrOut.rawResponse;
          const map: Record<string, { value: number | null; confidence: number }> = {};
          for (const res of ocrOut.results) {
            map[res.meter_code] = {
              value: res.extracted_value,
              confidence: res.confidence,
            };
          }
          deferredOcrByPhotoId.set(photoId, map);
        } catch {
          ocrStatus = "failed";
        }
      }
    }

    if (getDataMode() === "local") {
      const db = getLocalDb();
      const dataUrl = photo.data_base64.startsWith("data:")
        ? photo.data_base64
        : `data:${photo.mime_type || "image/webp"};base64,${cleanBase64}`;
      db.photos.push({
        id: photoId,
        storage_path: storagePath,
        data_url: dataUrl,
        captured_at: photo.captured_at || new Date().toISOString(),
        uploaded_by: actor.id,
        ocr_raw_response: ocrRaw,
        ocr_status: ocrStatus,
      });
      saveLocalDb(db);
    } else {
      const supabase = getSupabaseWriter() ?? (await getSupabaseReader());
      if (supabase) {
        await supabase.from("field_photos").insert({
          id: photoId,
          storage_path: storagePath,
          captured_at: photo.captured_at || new Date().toISOString(),
          uploaded_by: actor.id,
          ocr_raw_response: ocrRaw as never,
          ocr_status: ocrStatus,
        });
      }
    }

    syncedPhotoMap[photo.local_photo_id] = photoId;
  }

  // 2. Process mutations chronologically with client_mutation_id idempotency
  const sortedMutations = [...req.mutations].sort((a, b) =>
    a.reading_date.localeCompare(b.reading_date),
  );

  const results: SyncMutationResultDto[] = [];
  const failed: Array<{ client_mutation_id: string; error: string }> = [];
  const allTriggeredAlerts: AlertDto[] = [];

  for (const mut of sortedMutations) {
    try {
      const meter = mut.meter_id
        ? meterById.get(mut.meter_id) ?? meterByCode.get(mut.meter_code)
        : meterByCode.get(mut.meter_code);
      if (!meter) {
        failed.push({
          client_mutation_id: mut.client_mutation_id,
          error: `Medidor desconhecido: ${mut.meter_code}`,
        });
        continue;
      }

      const resolvedPhotoIds = Array.from(
        new Set([
          ...(mut.photo_ids ?? []),
          ...(mut.local_photo_ids ?? [])
            .map((lid) => syncedPhotoMap[lid])
            .filter(Boolean),
        ]),
      );

      // Check deferred OCR divergence if applicable
      let ocrSuggested = mut.ocr_suggested_value ?? null;
      let ocrConfidence = mut.ocr_confidence ?? null;
      let ocrDivergenceFlagged = false;

      if (ocrSuggested === null && resolvedPhotoIds.length > 0) {
        for (const pid of resolvedPhotoIds) {
          const ocrMap = deferredOcrByPhotoId.get(pid);
          const match = ocrMap?.[meter.code];
          if (match && match.value !== null) {
            ocrSuggested = match.value;
            ocrConfidence = match.confidence;
            const relDiff =
              Math.abs(mut.raw_value - match.value) /
              Math.max(1, Math.abs(match.value));
            if (relDiff > 0.05 && match.confidence >= 0.8) {
              ocrDivergenceFlagged = true;
            }
            break;
          }
        }
      }

      const nowIso = new Date().toISOString();

      if (getDataMode() === "local") {
        const db = getLocalDb();
        // Idempotency check by client_mutation_id
        const dup = db.readings.find(
          (r) => r.client_mutation_id === mut.client_mutation_id,
        );
        if (dup) {
          results.push({
            client_mutation_id: mut.client_mutation_id,
            reading_id: dup.id,
            meter_code: meter.code,
            reading_date: dup.reading_date,
            status: dup.status,
            is_duplicate_ignored: true,
            alerts_triggered: [],
          });
          continue;
        }

        const prevMap = await getPreviousReadingsBefore(
          mut.reading_date,
          catalog.meters,
        );
        const prevRef = prevMap[meter.code];
        let isDropWithoutFlag = false;
        if (meter.reading_kind === "cumulative" && prevRef) {
          const deltaRes = computeCumulativeDelta({
            currentValue: mut.raw_value,
            previousValue: prevRef.raw_value,
            currentDate: mut.reading_date,
            previousDate: prevRef.reading_date,
            multiplierFactor: meter.multiplier_factor,
            dialCapacity: meter.dial_capacity,
            isRollover: Boolean(mut.is_rollover),
            isMeterReplaced: Boolean(mut.is_meter_replaced),
            replacementBaseline: mut.replacement_baseline ?? null,
          });
          isDropWithoutFlag = deltaRes.isDropWithoutFlag;
        }

        const evalRes = evaluateReadingAlerts({
          meter,
          rawValue: mut.raw_value,
          previousValue: prevRef?.raw_value ?? null,
          isDropWithoutFlag,
        });

        const status: ReadingStatus =
          ocrDivergenceFlagged || isDropWithoutFlag
            ? "flagged"
            : "pending_review";

        const existingSameDay = db.readings.find(
          (r) =>
            r.reading_date === mut.reading_date && r.meter_id === meter.id,
        );

        let readingRecord: LocalReadingRecord;
        if (existingSameDay) {
          const prevVal = existingSameDay.raw_value;
          existingSameDay.raw_value = mut.raw_value;
          existingSameDay.input_source = mut.input_source;
          existingSameDay.ocr_suggested_value = ocrSuggested;
          existingSameDay.ocr_confidence = ocrConfidence;
          existingSameDay.is_rollover = Boolean(mut.is_rollover);
          existingSameDay.is_meter_replaced = Boolean(mut.is_meter_replaced);
          existingSameDay.replacement_baseline = mut.replacement_baseline ?? null;
          existingSameDay.notes = mut.notes ?? existingSameDay.notes;
          existingSameDay.status = status;
          existingSameDay.client_mutation_id = mut.client_mutation_id;
          existingSameDay.updated_at = nowIso;
          readingRecord = existingSameDay;

          db.auditLogs.push({
            id: crypto.randomUUID(),
            reading_id: existingSameDay.id,
            actor_id: actor.id,
            actor_name: actor.full_name,
            action: "update_value",
            previous_value: prevVal,
            new_value: mut.raw_value,
            reason: mut.notes ?? "Atualização via sincronização de campo",
            created_at: nowIso,
          });
        } else {
          readingRecord = {
            id: crypto.randomUUID(),
            reading_date: mut.reading_date,
            meter_id: meter.id,
            meter_code: meter.code,
            raw_value: mut.raw_value,
            input_source: mut.input_source,
            ocr_suggested_value: ocrSuggested,
            ocr_confidence: ocrConfidence,
            is_rollover: Boolean(mut.is_rollover),
            is_meter_replaced: Boolean(mut.is_meter_replaced),
            replacement_baseline: mut.replacement_baseline ?? null,
            notes: mut.notes ?? null,
            status,
            created_by: actor.id,
            reviewed_by: null,
            reviewed_at: null,
            client_mutation_id: mut.client_mutation_id,
            created_at: nowIso,
            updated_at: nowIso,
          };
          db.readings.push(readingRecord);

          db.auditLogs.push({
            id: crypto.randomUUID(),
            reading_id: readingRecord.id,
            actor_id: actor.id,
            actor_name: actor.full_name,
            action: "create",
            previous_value: null,
            new_value: mut.raw_value,
            reason: mut.notes ?? "Lançamento em campo",
            created_at: nowIso,
          });
        }

        for (const pid of resolvedPhotoIds) {
          const existsLink = db.readingPhotos.some(
            (rp) => rp.reading_id === readingRecord.id && rp.photo_id === pid,
          );
          if (!existsLink) {
            db.readingPhotos.push({ reading_id: readingRecord.id, photo_id: pid });
          }
        }

        db.alerts = db.alerts.filter((a) => a.reading_id !== readingRecord.id);
        const triggered: AlertDto[] = evalRes.alerts.map((a) => ({
          id: crypto.randomUUID(),
          reading_id: readingRecord.id,
          reading_date: readingRecord.reading_date,
          meter_id: meter.id,
          meter_code: meter.code,
          meter_label: meter.label,
          severity: a.severity,
          rule_code: a.rule_code,
          message: a.message,
          acknowledged_by: null,
          acknowledged_at: null,
          notified_email: false,
          notified_push: false,
          created_at: nowIso,
        }));

        // Check CAG water > 100% anomaly when either CAG m3 or Hidrometro Geral is updated
        if (
          meter.code === "cag_medidor_m3" ||
          meter.code === "agua_hidrometro_geral"
        ) {
          const cagRec = db.readings.find(
            (r) =>
              r.reading_date === mut.reading_date &&
              r.meter_code === "cag_medidor_m3",
          );
          const aguaRec = db.readings.find(
            (r) =>
              r.reading_date === mut.reading_date &&
              r.meter_code === "agua_hidrometro_geral",
          );
          const cagPrev = prevMap["cag_medidor_m3"];
          const aguaPrev = prevMap["agua_hidrometro_geral"];
          if (cagRec && aguaRec && cagPrev && aguaPrev) {
            const cagD = computeCumulativeDelta({
              currentValue: cagRec.raw_value,
              previousValue: cagPrev.raw_value,
              isRollover: cagRec.is_rollover,
              isMeterReplaced: cagRec.is_meter_replaced,
              replacementBaseline: cagRec.replacement_baseline,
            }).delta;
            const aguaD = computeCumulativeDelta({
              currentValue: aguaRec.raw_value,
              previousValue: aguaPrev.raw_value,
              isRollover: aguaRec.is_rollover,
              isMeterReplaced: aguaRec.is_meter_replaced,
              replacementBaseline: aguaRec.replacement_baseline,
            }).delta;
            const cagAnom = evaluateCagWaterAnomaly(cagD, aguaD);
            if (cagAnom) {
              triggered.push({
                id: crypto.randomUUID(),
                reading_id: readingRecord.id,
                reading_date: mut.reading_date,
                meter_id: meter.id,
                meter_code: meter.code,
                meter_label: meter.label,
                severity: cagAnom.severity,
                rule_code: cagAnom.rule_code,
                message: cagAnom.message,
                acknowledged_by: null,
                acknowledged_at: null,
                notified_email: false,
                notified_push: false,
                created_at: nowIso,
              });
            }
          }
        }

        db.alerts.push(...triggered);
        allTriggeredAlerts.push(...triggered);
        saveLocalDb(db);

        results.push({
          client_mutation_id: mut.client_mutation_id,
          reading_id: readingRecord.id,
          meter_code: meter.code,
          reading_date: readingRecord.reading_date,
          status: readingRecord.status,
          is_duplicate_ignored: false,
          alerts_triggered: triggered,
          ocr_divergence_flagged: ocrDivergenceFlagged,
        });
      } else {
        // Supabase mode
        const supabase = getSupabaseWriter() ?? (await getSupabaseReader());
        if (!supabase) throw new Error("Supabase unavailable");

        const { data: dup } = await supabase
          .from("meter_readings")
          .select("id, reading_date, status")
          .eq("client_mutation_id", mut.client_mutation_id)
          .maybeSingle();

        if (dup) {
          results.push({
            client_mutation_id: mut.client_mutation_id,
            reading_id: dup.id,
            meter_code: meter.code,
            reading_date: dup.reading_date,
            status: dup.status,
            is_duplicate_ignored: true,
            alerts_triggered: [],
          });
          continue;
        }

        const prevMap = await getPreviousReadingsBefore(
          mut.reading_date,
          catalog.meters,
        );
        const prevRef = prevMap[meter.code];
        let isDropWithoutFlag = false;
        if (meter.reading_kind === "cumulative" && prevRef) {
          const deltaRes = computeCumulativeDelta({
            currentValue: mut.raw_value,
            previousValue: prevRef.raw_value,
            currentDate: mut.reading_date,
            previousDate: prevRef.reading_date,
            multiplierFactor: meter.multiplier_factor,
            dialCapacity: meter.dial_capacity,
            isRollover: Boolean(mut.is_rollover),
            isMeterReplaced: Boolean(mut.is_meter_replaced),
            replacementBaseline: mut.replacement_baseline ?? null,
          });
          isDropWithoutFlag = deltaRes.isDropWithoutFlag;
        }

        const evalRes = evaluateReadingAlerts({
          meter,
          rawValue: mut.raw_value,
          previousValue: prevRef?.raw_value ?? null,
          isDropWithoutFlag,
        });

        const status: ReadingStatus =
          ocrDivergenceFlagged || isDropWithoutFlag
            ? "flagged"
            : "pending_review";

        const { data: upserted, error: upErr } = await supabase
          .from("meter_readings")
          .upsert(
            {
              reading_date: mut.reading_date,
              meter_id: meter.id,
              raw_value: mut.raw_value,
              input_source: mut.input_source,
              ocr_suggested_value: ocrSuggested,
              ocr_confidence: ocrConfidence,
              is_rollover: Boolean(mut.is_rollover),
              is_meter_replaced: Boolean(mut.is_meter_replaced),
              replacement_baseline: mut.replacement_baseline ?? null,
              notes: mut.notes ?? null,
              status,
              created_by: actor.id,
              client_mutation_id: mut.client_mutation_id,
            },
            { onConflict: "reading_date,meter_id" },
          )
          .select("id, reading_date, status")
          .single();

        if (upErr || !upserted) {
          throw new Error(upErr?.message ?? "Falha ao salvar leitura");
        }

        if (resolvedPhotoIds.length > 0) {
          await supabase.from("reading_photos").upsert(
            resolvedPhotoIds.map((pid) => ({
              reading_id: upserted.id,
              photo_id: pid,
            })),
            { onConflict: "reading_id,photo_id" },
          );
        }

        await supabase.from("alerts").delete().eq("reading_id", upserted.id);
        const triggered: AlertDto[] = [];
        for (const a of evalRes.alerts) {
          const { data: insAlert } = await supabase
            .from("alerts")
            .insert({
              reading_id: upserted.id,
              reading_date: upserted.reading_date,
              meter_id: meter.id,
              severity: a.severity,
              rule_code: a.rule_code,
              message: a.message,
            })
            .select("*")
            .single();
          if (insAlert) {
            const dto: AlertDto = {
              id: insAlert.id,
              reading_id: insAlert.reading_id,
              reading_date: insAlert.reading_date,
              meter_id: insAlert.meter_id,
              meter_code: meter.code,
              meter_label: meter.label,
              severity: insAlert.severity,
              rule_code: insAlert.rule_code,
              message: insAlert.message,
              acknowledged_by: insAlert.acknowledged_by,
              acknowledged_at: insAlert.acknowledged_at,
              notified_email: insAlert.notified_email,
              notified_push: insAlert.notified_push,
              created_at: insAlert.created_at,
            };
            triggered.push(dto);
            allTriggeredAlerts.push(dto);
          }
        }

        results.push({
          client_mutation_id: mut.client_mutation_id,
          reading_id: upserted.id,
          meter_code: meter.code,
          reading_date: upserted.reading_date,
          status: upserted.status,
          is_duplicate_ignored: false,
          alerts_triggered: triggered,
          ocr_divergence_flagged: ocrDivergenceFlagged,
        });
      }
    } catch (err) {
      failed.push({
        client_mutation_id: mut.client_mutation_id,
        error: err instanceof Error ? err.message : "Erro desconhecido",
      });
    }
  }

  // 3. Dispatch critical notifications (Email + Web Push) if any critical alerts occurred
  const criticalAlerts = allTriggeredAlerts.filter(
    (a) => a.severity === "critical",
  );
  if (criticalAlerts.length > 0) {
    if (getDataMode() === "local") {
      const db = getLocalDb();
      const notifRes = await dispatchCriticalNotifications({
        alerts: criticalAlerts,
        subscriptions: db.pushSubscriptions,
      });
      for (const ca of criticalAlerts) {
        const stored = db.alerts.find((a) => a.id === ca.id);
        if (stored) {
          stored.notified_email = notifRes.emailSent;
          stored.notified_push = notifRes.pushSentCount > 0;
        }
      }
      if (notifRes.expiredEndpoints.length > 0) {
        db.pushSubscriptions = db.pushSubscriptions.filter(
          (s) => !notifRes.expiredEndpoints.includes(s.endpoint),
        );
      }
      saveLocalDb(db);
    } else {
      const supabase = getSupabaseWriter();
      if (supabase) {
        const { data: subs } = await supabase
          .from("push_subscriptions")
          .select("endpoint, keys_json");
        const pushSubs = (subs ?? []).map((s) => ({
          endpoint: s.endpoint,
          keys_json: s.keys_json as { p256dh: string; auth: string },
        }));
        const notifRes = await dispatchCriticalNotifications({
          alerts: criticalAlerts,
          subscriptions: pushSubs,
        });
        await supabase
          .from("alerts")
          .update({
            notified_email: notifRes.emailSent,
            notified_push: notifRes.pushSentCount > 0,
          })
          .in(
            "id",
            criticalAlerts.map((a) => a.id),
          );
        if (notifRes.expiredEndpoints.length > 0) {
          await supabase
            .from("push_subscriptions")
            .delete()
            .in("endpoint", notifRes.expiredEndpoints);
        }
      }
    }
  }

  return {
    synced_photo_map: syncedPhotoMap,
    results,
    failed,
    server_timestamp: new Date().toISOString(),
  };
}

export async function updateCatalog(
  req: CatalogUpdateRequest,
  actor: AuthUserProfile,
): Promise<CatalogResponse> {
  if (getDataMode() === "local") {
    const db = getLocalDb();

    for (const gu of req.group_updates ?? []) {
      const g = db.groups.find((item) => item.id === gu.id);
      if (!g) continue;
      if (gu.name !== undefined) g.name = gu.name;
      if (gu.display_order !== undefined) g.display_order = gu.display_order;
      if (gu.is_active_in_field !== undefined) {
        g.is_active_in_field = gu.is_active_in_field;
        // Also cascade to group meters when toggling section activation
        for (const m of db.meters) {
          if (m.group_id === g.id) {
            m.is_active_in_field = gu.is_active_in_field;
          }
        }
      }
      if (gu.allow_batch_photo !== undefined) {
        g.allow_batch_photo = gu.allow_batch_photo;
      }
    }

    for (const mu of req.meter_updates ?? []) {
      const m = db.meters.find((item) => item.id === mu.id);
      if (!m) continue;
      if (mu.label !== undefined) m.label = mu.label;
      if (mu.unit !== undefined) m.unit = mu.unit;
      if (mu.multiplier_factor !== undefined) {
        m.multiplier_factor = mu.multiplier_factor;
      }
      if (mu.dial_capacity !== undefined) m.dial_capacity = mu.dial_capacity;
      if (mu.photo_required !== undefined) m.photo_required = mu.photo_required;
      if (mu.is_active_in_field !== undefined) {
        m.is_active_in_field = mu.is_active_in_field;
      }
      if (mu.is_active_in_sheet !== undefined) {
        m.is_active_in_sheet = mu.is_active_in_sheet;
      }
      if (mu.sort_order !== undefined) m.sort_order = mu.sort_order;
      if (mu.ocr_hint !== undefined) m.ocr_hint = mu.ocr_hint;
    }

    for (const tu of req.threshold_updates ?? []) {
      const m = db.meters.find((item) => item.id === tu.meter_id);
      if (!m) continue;
      const nowIso = new Date().toISOString();
      if (!m.threshold) {
        m.threshold = {
          id: crypto.randomUUID(),
          meter_id: m.id,
          warning_min: tu.warning_min ?? null,
          critical_min: tu.critical_min ?? null,
          teto_value: tu.teto_value ?? null,
          effective_from: nowIso.slice(0, 10),
          updated_by: actor.id,
          updated_at: nowIso,
        };
      } else {
        if (tu.warning_min !== undefined) m.threshold.warning_min = tu.warning_min;
        if (tu.critical_min !== undefined) {
          m.threshold.critical_min = tu.critical_min;
        }
        if (tu.teto_value !== undefined) m.threshold.teto_value = tu.teto_value;
        m.threshold.updated_by = actor.id;
        m.threshold.updated_at = nowIso;
      }
    }

    if (req.new_meter) {
      const nm = req.new_meter;
      const g = db.groups.find((item) => item.id === nm.group_id);
      if (!g) throw new Error("Grupo não encontrado.");
      const maxOrder = db.meters
        .filter((m) => m.group_id === g.id)
        .reduce((acc, m) => Math.max(acc, m.sort_order), 0);
      db.meters.push({
        id: crypto.randomUUID(),
        group_id: g.id,
        group_slug: g.slug,
        code: nm.code,
        excel_header: nm.excel_header,
        label: nm.label,
        unit: nm.unit ?? null,
        reading_kind: nm.reading_kind,
        multiplier_factor: nm.multiplier_factor ?? 1,
        dial_capacity: nm.dial_capacity ?? null,
        photo_required: nm.photo_required ?? true,
        is_active_in_field: nm.is_active_in_field ?? true,
        is_active_in_sheet: nm.is_active_in_sheet ?? true,
        sort_order: nm.sort_order ?? maxOrder + 1,
        ocr_hint: nm.ocr_hint ?? null,
        threshold: null,
      });
    }

    for (const uu of req.user_updates ?? []) {
      const u = db.users.find((item) => item.id === uu.id);
      if (!u) continue;
      if (uu.role !== undefined) u.role = uu.role;
      if (uu.active !== undefined) u.active = uu.active;
      if (uu.full_name !== undefined) u.full_name = uu.full_name;
      if (uu.restrict_groups !== undefined) {
        u.restrict_groups = uu.restrict_groups;
      }
      if (uu.allowed_group_ids !== undefined) {
        u.allowed_group_ids = [...uu.allowed_group_ids];
      }
    }

    if (req.new_user) {
      const nu = req.new_user;
      if (db.users.some((u) => u.email.toLowerCase() === nu.email.toLowerCase())) {
        throw new Error("Já existe um usuário com este e-mail.");
      }
      db.users.push({
        id: crypto.randomUUID(),
        email: nu.email.trim(),
        full_name: nu.full_name.trim(),
        role: nu.role,
        active: true,
        restrict_groups: nu.restrict_groups ?? false,
        allowed_group_ids: nu.allowed_group_ids ?? [],
      });
    }

    saveLocalDb(db);
    return getCatalogData();
  }

  const supabase = getSupabaseWriter() ?? (await getSupabaseReader());
  if (!supabase) throw new Error("Supabase unavailable");

  for (const gu of req.group_updates ?? []) {
    const patch: Record<string, unknown> = {};
    if (gu.name !== undefined) patch.name = gu.name;
    if (gu.display_order !== undefined) patch.display_order = gu.display_order;
    if (gu.is_active_in_field !== undefined) {
      patch.is_active_in_field = gu.is_active_in_field;
    }
    if (gu.allow_batch_photo !== undefined) {
      patch.allow_batch_photo = gu.allow_batch_photo;
    }
    if (Object.keys(patch).length > 0) {
      await supabase.from("meter_groups").update(patch).eq("id", gu.id);
      if (gu.is_active_in_field !== undefined) {
        await supabase
          .from("meters")
          .update({ is_active_in_field: gu.is_active_in_field })
          .eq("group_id", gu.id);
      }
    }
  }

  for (const mu of req.meter_updates ?? []) {
    const patch: Record<string, unknown> = {};
    if (mu.label !== undefined) patch.label = mu.label;
    if (mu.unit !== undefined) patch.unit = mu.unit;
    if (mu.multiplier_factor !== undefined) {
      patch.multiplier_factor = mu.multiplier_factor;
    }
    if (mu.dial_capacity !== undefined) patch.dial_capacity = mu.dial_capacity;
    if (mu.photo_required !== undefined) patch.photo_required = mu.photo_required;
    if (mu.is_active_in_field !== undefined) {
      patch.is_active_in_field = mu.is_active_in_field;
    }
    if (mu.is_active_in_sheet !== undefined) {
      patch.is_active_in_sheet = mu.is_active_in_sheet;
    }
    if (mu.sort_order !== undefined) patch.sort_order = mu.sort_order;
    if (mu.ocr_hint !== undefined) patch.ocr_hint = mu.ocr_hint;
    if (Object.keys(patch).length > 0) {
      await supabase.from("meters").update(patch).eq("id", mu.id);
    }
  }

  for (const tu of req.threshold_updates ?? []) {
    await supabase.from("meter_thresholds").upsert(
      {
        meter_id: tu.meter_id,
        warning_min: tu.warning_min ?? null,
        critical_min: tu.critical_min ?? null,
        teto_value: tu.teto_value ?? null,
        effective_from: new Date().toISOString().slice(0, 10),
        updated_by: actor.id,
      },
      { onConflict: "meter_id,effective_from" },
    );
  }

  if (req.new_meter) {
    const nm = req.new_meter;
    await supabase.from("meters").insert({
      group_id: nm.group_id,
      code: nm.code,
      excel_header: nm.excel_header,
      label: nm.label,
      unit: nm.unit ?? null,
      reading_kind: nm.reading_kind,
      multiplier_factor: nm.multiplier_factor ?? 1,
      dial_capacity: nm.dial_capacity ?? null,
      photo_required: nm.photo_required ?? true,
      is_active_in_field: nm.is_active_in_field ?? true,
      is_active_in_sheet: nm.is_active_in_sheet ?? true,
      sort_order: nm.sort_order ?? 99,
      ocr_hint: nm.ocr_hint ?? null,
    });
  }

  for (const uu of req.user_updates ?? []) {
    const patch: Record<string, unknown> = {};
    if (uu.role !== undefined) patch.role = uu.role;
    if (uu.active !== undefined) patch.active = uu.active;
    if (uu.full_name !== undefined) patch.full_name = uu.full_name;
    if (uu.restrict_groups !== undefined) {
      patch.restrict_groups = uu.restrict_groups;
    }
    if (Object.keys(patch).length > 0) {
      const { error: uErr } = await supabase
        .from("profiles")
        .update(patch)
        .eq("id", uu.id);
      if (uErr) throw new Error(uErr.message);
    }
    if (uu.allowed_group_ids !== undefined) {
      const { error: delErr } = await supabase
        .from("user_meter_groups")
        .delete()
        .eq("user_id", uu.id);
      if (delErr) throw new Error(delErr.message);

      if (uu.allowed_group_ids.length > 0) {
        const { error: insErr } = await supabase
          .from("user_meter_groups")
          .insert(
            uu.allowed_group_ids.map((groupId) => ({
              user_id: uu.id,
              group_id: groupId,
            })),
          );
        if (insErr) throw new Error(insErr.message);
      }
    }
  }

  if (req.new_user) {
    const adminClient = createSupabaseAdminClient();
    if (!adminClient) {
      throw new Error(
        "SUPABASE_SERVICE_ROLE_KEY não configurada para criar novos logins.",
      );
    }
    const nu = req.new_user;
    const { data: created, error: createErr } =
      await adminClient.auth.admin.createUser({
        email: nu.email.trim(),
        password: nu.password,
        email_confirm: true,
        user_metadata: {
          full_name: nu.full_name.trim(),
          role: nu.role,
        },
      });
    if (createErr || !created.user) {
      throw new Error(createErr?.message ?? "Falha ao criar usuário no Auth.");
    }
    const newUserId = created.user.id;
    await adminClient
      .from("profiles")
      .upsert({
        id: newUserId,
        full_name: nu.full_name.trim(),
        role: nu.role,
        active: true,
        restrict_groups: nu.restrict_groups ?? false,
      });

    if (nu.allowed_group_ids && nu.allowed_group_ids.length > 0) {
      const { error: linkErr } = await adminClient
        .from("user_meter_groups")
        .insert(
          nu.allowed_group_ids.map((groupId) => ({
            user_id: newUserId,
            group_id: groupId,
          })),
        );
      if (linkErr) throw new Error(linkErr.message);
    }
  }

  return getCatalogData();
}

export async function acknowledgeAlert(
  alertId: string,
  acknowledge: boolean,
  actor: AuthUserProfile,
): Promise<AlertDto> {
  const nowIso = acknowledge ? new Date().toISOString() : null;

  if (getDataMode() === "local") {
    const db = getLocalDb();
    const alert = db.alerts.find((a) => a.id === alertId);
    if (!alert) throw new Error("Alerta não encontrado.");
    alert.acknowledged_by = acknowledge ? actor.id : null;
    alert.acknowledged_at = nowIso;
    saveLocalDb(db);
    return alert;
  }

  const supabase = getSupabaseWriter() ?? (await getSupabaseReader());
  if (!supabase) throw new Error("Supabase unavailable");

  const { data, error } = await supabase
    .from("alerts")
    .update({
      acknowledged_by: acknowledge ? actor.id : null,
      acknowledged_at: nowIso,
    })
    .eq("id", alertId)
    .select("*")
    .single();
  if (error || !data) throw new Error(error?.message ?? "Alerta não encontrado.");

  const catalog = await getCatalogData();
  const meter = catalog.meters.find((m) => m.id === data.meter_id);
  return {
    id: data.id,
    reading_id: data.reading_id,
    reading_date: data.reading_date,
    meter_id: data.meter_id,
    meter_code: meter?.code ?? "",
    meter_label: meter?.label ?? "",
    severity: data.severity,
    rule_code: data.rule_code,
    message: data.message,
    acknowledged_by: data.acknowledged_by,
    acknowledged_at: data.acknowledged_at,
    notified_email: data.notified_email,
    notified_push: data.notified_push,
    created_at: data.created_at,
  };
}

export async function savePushSubscription(
  req: PushSubscribeRequest,
  user: AuthUserProfile,
): Promise<void> {
  if (getDataMode() === "local") {
    const db = getLocalDb();
    const existing = db.pushSubscriptions.find(
      (s) => s.endpoint === req.endpoint,
    );
    if (existing) {
      existing.user_id = user.id;
      existing.keys_json = req.keys;
    } else {
      db.pushSubscriptions.push({
        id: crypto.randomUUID(),
        user_id: user.id,
        endpoint: req.endpoint,
        keys_json: req.keys,
        created_at: new Date().toISOString(),
      });
    }
    saveLocalDb(db);
    return;
  }

  const supabase = getSupabaseWriter() ?? (await getSupabaseReader());
  if (!supabase) throw new Error("Supabase unavailable");

  await supabase.from("push_subscriptions").upsert(
    {
      user_id: user.id,
      endpoint: req.endpoint,
      keys_json: req.keys,
    },
    { onConflict: "endpoint" },
  );
}

export async function deletePushSubscription(
  endpoint: string,
  user: AuthUserProfile,
): Promise<void> {
  if (getDataMode() === "local") {
    const db = getLocalDb();
    db.pushSubscriptions = db.pushSubscriptions.filter(
      (s) => !(s.endpoint === endpoint && s.user_id === user.id),
    );
    saveLocalDb(db);
    return;
  }

  const supabase = getSupabaseWriter() ?? (await getSupabaseReader());
  if (!supabase) throw new Error("Supabase unavailable");
  await supabase
    .from("push_subscriptions")
    .delete()
    .eq("endpoint", endpoint)
    .eq("user_id", user.id);
}

export async function hasPushSubscriptionForUser(
  userId: string,
): Promise<boolean> {
  if (getDataMode() === "local") {
    const db = getLocalDb();
    return db.pushSubscriptions.some((s) => s.user_id === userId);
  }
  const supabase = await getSupabaseReader();
  if (!supabase) return false;
  const { count } = await supabase
    .from("push_subscriptions")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId);
  return (count ?? 0) > 0;
}
