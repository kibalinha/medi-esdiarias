import type {
  AlertRuleCode,
  AlertSeverity,
  EvaluationSeverity,
  MeterDto,
  MeterThresholdDto,
} from "@/types/contracts";

export interface AlertEvaluationItem {
  severity: AlertSeverity;
  rule_code: AlertRuleCode;
  message: string;
  notify_critical: boolean;
}

export interface EvaluateReadingAlertInput {
  meter: Pick<MeterDto, "code" | "label" | "reading_kind" | "unit"> & {
    threshold?: Pick<
      MeterThresholdDto,
      "warning_min" | "critical_min" | "teto_value"
    > | null;
  };
  rawValue: number;
  previousValue?: number | null;
  isDropWithoutFlag?: boolean;
}

export interface EvaluateReadingAlertResult {
  highestSeverity: EvaluationSeverity;
  alerts: AlertEvaluationItem[];
}

const DEFAULT_CONDUTIVIMETRO_WARNING_MIN = 700;
const DEFAULT_CONDUTIVIMETRO_CRITICAL_GT = 1000;

export function isCondutivimetroMeter(meterCode: string, readingKind: string): boolean {
  return (
    readingKind === "quality" ||
    meterCode.includes("condutivimetro")
  );
}

export function isDemandMeter(meterCode: string): boolean {
  return meterCode.includes("demanda");
}

export function evaluateReadingAlerts(
  input: EvaluateReadingAlertInput,
): EvaluateReadingAlertResult {
  const { meter, rawValue, previousValue, isDropWithoutFlag } = input;
  const alerts: AlertEvaluationItem[] = [];

  if (isDropWithoutFlag) {
    const prevText =
      previousValue !== null && previousValue !== undefined
        ? String(previousValue)
        : "N/D";
    alerts.push({
      severity: "warning",
      rule_code: "QUEDA_MEDIDOR",
      message: `${meter.label}: leitura atual (${rawValue}) menor que a anterior (${prevText}). Confirme se houve erro no OCR/digitação ou marque Virada/Troca de medidor.`,
      notify_critical: false,
    });
  }

  if (isCondutivimetroMeter(meter.code, meter.reading_kind)) {
    const warningMin =
      meter.threshold?.warning_min ?? DEFAULT_CONDUTIVIMETRO_WARNING_MIN;
    const criticalLimit =
      meter.threshold?.critical_min ?? DEFAULT_CONDUTIVIMETRO_CRITICAL_GT;

    // SPEC 4.2: <700 ok, 700..1000 warning, >1000 critical
    if (rawValue > criticalLimit) {
      alerts.push({
        severity: "critical",
        rule_code: "CONDUTIVIMETRO_CRITICO",
        message: `${meter.label} em faixa CRÍTICA: ${rawValue} (> ${criticalLimit}).`,
        notify_critical: true,
      });
    } else if (rawValue >= warningMin) {
      alerts.push({
        severity: "warning",
        rule_code: "CONDUTIVIMETRO_ALTO",
        message: `${meter.label} em faixa ALTA: ${rawValue} (${warningMin}..${criticalLimit}).`,
        notify_critical: false,
      });
    }
  } else if (isDemandMeter(meter.code)) {
    const teto =
      meter.threshold?.teto_value ?? meter.threshold?.critical_min ?? null;
    if (teto !== null && Number.isFinite(teto) && teto > 0) {
      const warningMin = meter.threshold?.warning_min ?? teto * 0.9;
      // SPEC 4.2: >= 90% and < 100% warning; >= 100% critical
      if (rawValue >= teto) {
        alerts.push({
          severity: "critical",
          rule_code: "DEMANDA_TETO",
          message: `${meter.label} atingiu/ultrapassou o teto: ${rawValue} kW >= ${teto} kW.`,
          notify_critical: true,
        });
      } else if (rawValue >= warningMin) {
        const pct = Math.round((rawValue / teto) * 1000) / 10;
        alerts.push({
          severity: "warning",
          rule_code: "DEMANDA_ATENCAO",
          message: `${meter.label} próxima do teto (${pct}%): ${rawValue} kW (teto ${teto} kW).`,
          notify_critical: false,
        });
      }
    }
  }

  let highestSeverity: EvaluationSeverity = "ok";
  if (alerts.some((a) => a.severity === "critical")) {
    highestSeverity = "critical";
  } else if (alerts.some((a) => a.severity === "warning")) {
    highestSeverity = "warning";
  }

  return { highestSeverity, alerts };
}

export function evaluateCagWaterAnomaly(
  cagWaterM3: number | null,
  totalWaterM3: number | null,
): AlertEvaluationItem | null {
  if (
    cagWaterM3 === null ||
    totalWaterM3 === null ||
    totalWaterM3 <= 0
  ) {
    return null;
  }
  const ratio = cagWaterM3 / totalWaterM3;
  if (ratio > 1) {
    const pct = (ratio * 100).toFixed(1);
    return {
      severity: "warning",
      rule_code: "CAG_AGUA_ANOMALIA",
      message: `Consumo de água CAG (${cagWaterM3} m³, ${pct}%) excede o Consumo Geral (${totalWaterM3} m³).`,
      notify_critical: false,
    };
  }
  return null;
}
