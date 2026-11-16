import { roundFloat } from "./cumulative";

/**
 * Formats col E ("Água - Abastecimento Cisternas"):
 * CONCAT("Tempo total de carregamento - ", F, " horas")
 */
export function formatCisternasText(
  hours: number | null | undefined,
): string | null {
  if (hours === null || hours === undefined || !Number.isFinite(hours)) {
    return null;
  }
  return `Tempo total de carregamento - ${hours} horas`;
}

/**
 * Computes BSS i Geral = Fora Ponta + Ponta when at least one side is present.
 */
export function computeBssGeneralConsumption(
  foraPonta: number | null | undefined,
  ponta: number | null | undefined,
): number | null {
  const hasFp =
    foraPonta !== null && foraPonta !== undefined && Number.isFinite(foraPonta);
  const hasP = ponta !== null && ponta !== undefined && Number.isFinite(ponta);
  if (!hasFp && !hasP) return null;
  return roundFloat((hasFp ? foraPonta! : 0) + (hasP ? ponta! : 0));
}

/**
 * Computes Total Energy Consumption (col AX) = SUM(BSS 1..4 Geral).
 */
export function computeTotalEnergyConsumption(
  bssGenerals: Array<number | null | undefined>,
): number | null {
  let sum = 0;
  let hasAny = false;
  for (const v of bssGenerals) {
    if (v !== null && v !== undefined && Number.isFinite(v)) {
      sum += v;
      hasAny = true;
    }
  }
  return hasAny ? roundFloat(sum) : null;
}

/**
 * Computes CAG % Consumo de Energia (col CB).
 * Returns decimal ratio (e.g. 0.25 = 25%) or null when Consumo Total <= 0.
 */
export function computeCagEnergyPercent(
  cagConsumptionKwh: number | null | undefined,
  totalEnergyKwh: number | null | undefined,
): number | null {
  if (
    cagConsumptionKwh === null ||
    cagConsumptionKwh === undefined ||
    !Number.isFinite(cagConsumptionKwh) ||
    totalEnergyKwh === null ||
    totalEnergyKwh === undefined ||
    !Number.isFinite(totalEnergyKwh) ||
    totalEnergyKwh <= 0
  ) {
    return null;
  }
  return roundFloat(cagConsumptionKwh / totalEnergyKwh, 6);
}

export interface CagWaterPercentResult {
  ratio: number | null;
  isAnomaly: boolean;
  display: string;
}

/**
 * Computes CAG % Consumo de Água (col CG).
 * Unlike Excel's IFERROR(..., "100%"), returns null / "-" (N/D) when totalWaterM3 == 0.
 * Flags isAnomaly = true when ratio > 1 (> 100%).
 */
export function computeCagWaterPercent(
  cagWaterM3: number | null | undefined,
  totalWaterM3: number | null | undefined,
): CagWaterPercentResult {
  if (
    cagWaterM3 === null ||
    cagWaterM3 === undefined ||
    !Number.isFinite(cagWaterM3) ||
    totalWaterM3 === null ||
    totalWaterM3 === undefined ||
    !Number.isFinite(totalWaterM3) ||
    totalWaterM3 <= 0
  ) {
    return {
      ratio: null,
      isAnomaly: false,
      display: "-",
    };
  }
  const ratio = roundFloat(cagWaterM3 / totalWaterM3, 6);
  return {
    ratio,
    isAnomaly: ratio > 1,
    display: `${(ratio * 100).toFixed(2).replace(".", ",")}%`,
  };
}

export function formatPercentBr(ratio: number | null | undefined): string {
  if (ratio === null || ratio === undefined || !Number.isFinite(ratio)) {
    return "-";
  }
  return `${(ratio * 100).toFixed(2).replace(".", ",")}%`;
}

export function formatNumberBr(
  val: number | null | undefined,
  decimals = 2,
): string {
  if (val === null || val === undefined || !Number.isFinite(val)) {
    return "-";
  }
  const isInt = Number.isInteger(val);
  return val.toLocaleString("pt-BR", {
    minimumFractionDigits: isInt ? 0 : Math.min(decimals, 2),
    maximumFractionDigits: decimals,
  });
}
