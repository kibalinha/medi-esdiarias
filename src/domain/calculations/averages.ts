import { roundFloat } from "./cumulative";

export interface DatedMetricValue {
  date: string; // YYYY-MM-DD
  value: number | null | undefined;
}

/**
 * Mirrors Excel AVERAGEIF(range, "<>0"):
 * ignores null, undefined, NaN, and exact 0.
 */
export function computeAverageNonZero(
  values: Array<number | null | undefined>,
): number | null {
  let sum = 0;
  let count = 0;
  for (const val of values) {
    if (val === null || val === undefined || !Number.isFinite(val)) continue;
    if (val === 0) continue;
    sum += val;
    count += 1;
  }
  if (count === 0) return null;
  return roundFloat(sum / count, 4);
}

/**
 * Standard arithmetic average ignoring null/undefined/NaN (used for temperatures).
 */
export function computeArithmeticAverage(
  values: Array<number | null | undefined>,
): number | null {
  let sum = 0;
  let count = 0;
  for (const val of values) {
    if (val === null || val === undefined || !Number.isFinite(val)) continue;
    sum += val;
    count += 1;
  }
  if (count === 0) return null;
  return roundFloat(sum / count, 4);
}

export function parseYearMonth(dateStr: string): { year: number; month: number } | null {
  const match = /^(\d{4})-(\d{2})-\d{2}/.exec(dateStr);
  if (!match) return null;
  return {
    year: Number(match[1]),
    month: Number(match[2]),
  };
}

/**
 * Monthly average using AVERAGEIF(..., "<>0") semantics.
 */
export function monthlyAverage(
  entries: DatedMetricValue[],
  year: number,
  month: number,
): number | null {
  const filtered: number[] = [];
  for (const entry of entries) {
    const ym = parseYearMonth(entry.date);
    if (!ym || ym.year !== year || ym.month !== month) continue;
    if (
      entry.value !== null &&
      entry.value !== undefined &&
      Number.isFinite(entry.value) &&
      entry.value !== 0
    ) {
      filtered.push(entry.value);
    }
  }
  return computeAverageNonZero(filtered);
}

/**
 * Year-over-Year monthly average (year - 1, same month) using AVERAGEIF(..., "<>0").
 * Eliminates Excel #REF! errors by returning null when no prior-year data exists.
 */
export function previousYearAverage(
  entries: DatedMetricValue[],
  year: number,
  month: number,
): number | null {
  return monthlyAverage(entries, year - 1, month);
}
