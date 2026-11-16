import { describe, expect, it } from "vitest";
import {
  computeArithmeticAverage,
  computeAverageNonZero,
  computeBssGeneralConsumption,
  computeCagEnergyPercent,
  computeCagWaterPercent,
  computeCumulativeDelta,
  computeTotalEnergyConsumption,
  formatCisternasText,
  monthlyAverage,
  previousYearAverage,
} from "@/domain/calculations";

describe("computeCumulativeDelta", () => {
  it("computes normal cumulative delta across standard consecutive days", () => {
    // Real values from spreadsheet: 2026-01-01 (243338) -> 2026-01-02 (243653)
    const res = computeCumulativeDelta({
      currentValue: 243653,
      previousValue: 243338,
      previousDate: "2026-01-01",
      currentDate: "2026-01-02",
    });

    expect(res).toEqual({
      delta: 315,
      isDropWithoutFlag: false,
      isMultiDayDelta: false,
      isRolloverApplied: false,
      isReplacedApplied: false,
    });
  });

  it("handles Reuso rollover 9999 -> 4 with dial_capacity 10000 returning 5 (real 2025-09-19 case)", () => {
    const res = computeCumulativeDelta({
      currentValue: 4,
      previousValue: 9999,
      previousDate: "2025-09-18",
      currentDate: "2025-09-19",
      dialCapacity: 10000,
      isRollover: true,
    });

    expect(res).toEqual({
      delta: 5,
      isDropWithoutFlag: false,
      isMultiDayDelta: false,
      isRolloverApplied: true,
      isReplacedApplied: false,
    });
  });

  it("infers 4-digit dial capacity (10000) when rollover is flagged without explicit capacity", () => {
    const res = computeCumulativeDelta({
      currentValue: 4,
      previousValue: 9999,
      isRollover: true,
    });

    expect(res.delta).toBe(5);
    expect(res.isRolloverApplied).toBe(true);
    expect(res.isDropWithoutFlag).toBe(false);
  });

  it("flags unflagged drop (current < previous) without silently zeroing", () => {
    const res = computeCumulativeDelta({
      currentValue: 4,
      previousValue: 9999,
      previousDate: "2025-09-18",
      currentDate: "2025-09-19",
      isRollover: false,
      isMeterReplaced: false,
    });

    expect(res).toEqual({
      delta: null,
      isDropWithoutFlag: true,
      isMultiDayDelta: false,
      isRolloverApplied: false,
      isReplacedApplied: false,
    });
  });

  it("computes delta with baseline offset when meter is replaced", () => {
    const resDefaultBaseline = computeCumulativeDelta({
      currentValue: 18,
      previousValue: 9540,
      previousDate: "2026-04-10",
      currentDate: "2026-04-11",
      isMeterReplaced: true,
    });
    expect(resDefaultBaseline).toEqual({
      delta: 18,
      isDropWithoutFlag: false,
      isMultiDayDelta: false,
      isRolloverApplied: false,
      isReplacedApplied: true,
    });

    const resCustomBaseline = computeCumulativeDelta({
      currentValue: 125,
      previousValue: 9540,
      isMeterReplaced: true,
      replacementBaseline: 100,
    });
    expect(resCustomBaseline.delta).toBe(25);
    expect(resCustomBaseline.isReplacedApplied).toBe(true);
  });

  it("handles year transition 31/12/2025 -> 01/01/2026 continuously (Reuso 2775 -> 2788)", () => {
    const res = computeCumulativeDelta({
      currentValue: 2788,
      previousValue: 2775,
      previousDate: "2025-12-31",
      currentDate: "2026-01-01",
    });

    expect(res).toEqual({
      delta: 13,
      isDropWithoutFlag: false,
      isMultiDayDelta: false,
      isRolloverApplied: false,
      isReplacedApplied: false,
    });
  });

  it("marks isMultiDayDelta when gap between readings exceeds 1 day", () => {
    const res = computeCumulativeDelta({
      currentValue: 244500,
      previousValue: 243653,
      previousDate: "2026-01-02",
      currentDate: "2026-01-05",
    });

    expect(res.delta).toBe(847);
    expect(res.isMultiDayDelta).toBe(true);
  });

  it("applies CAG kWh multiplier factor x1000 (real 2025-12-31 -> 2026-01-01)", () => {
    // 2025-12-31 CAG kWh = 39007; 2026-01-01 consumption = 8000 => reading 39015
    const res = computeCumulativeDelta({
      currentValue: 39015,
      previousValue: 39007,
      previousDate: "2025-12-31",
      currentDate: "2026-01-01",
      multiplierFactor: 1000,
    });

    expect(res.delta).toBe(8000);
    expect(res.isMultiDayDelta).toBe(false);
  });

  it("returns null delta when previousValue is absent and meter is not replaced", () => {
    const res = computeCumulativeDelta({
      currentValue: 100,
      previousValue: null,
    });
    expect(res.delta).toBeNull();
    expect(res.isDropWithoutFlag).toBe(false);
  });
});

describe("monthlyAverage & previousYearAverage (AVERAGEIF <> 0)", () => {
  const entries = [
    // Jan 2025: values 300, 0 (ignored), 400, null (ignored), 500 => avg = 400
    { date: "2025-01-01", value: 300 },
    { date: "2025-01-02", value: 0 },
    { date: "2025-01-03", value: 400 },
    { date: "2025-01-04", value: null },
    { date: "2025-01-05", value: 500 },
    // Feb 2025: only zeros => null
    { date: "2025-02-01", value: 0 },
    { date: "2025-02-02", value: 0 },
    // Jan 2026: values 320, 315, 0 => avg = 317.5
    { date: "2026-01-01", value: 320 },
    { date: "2026-01-02", value: 315 },
    { date: "2026-01-03", value: 0 },
  ];

  it("ignores zeros and nulls in computeAverageNonZero", () => {
    expect(computeAverageNonZero([300, 0, 400, null, undefined, 500])).toBe(400);
    expect(computeAverageNonZero([0, 0, null])).toBeNull();
  });

  it("computes monthlyAverage ignoring 0 values", () => {
    expect(monthlyAverage(entries, 2025, 1)).toBe(400);
    expect(monthlyAverage(entries, 2026, 1)).toBe(317.5);
    expect(monthlyAverage(entries, 2025, 2)).toBeNull();
  });

  it("computes YoY previousYearAverage cleanly without #REF!", () => {
    expect(previousYearAverage(entries, 2026, 1)).toBe(400);
    // No 2024 data -> returns null cleanly instead of error
    expect(previousYearAverage(entries, 2025, 1)).toBeNull();
  });
});

describe("domain formulas (Cisternas, BSS, CAG, Temperatures)", () => {
  it("formats Abastecimento Cisternas text from hours", () => {
    expect(formatCisternasText(4)).toBe("Tempo total de carregamento - 4 horas");
    expect(formatCisternasText(2.5)).toBe("Tempo total de carregamento - 2.5 horas");
    expect(formatCisternasText(null)).toBeNull();
  });

  it("computes Joquey (8 stores) and Guaíba (6 stores) arithmetic averages", () => {
    // Real 2026-01-01 values: Jockey avg = 24.4625, Guaíba avg = 26.6667
    const jockeyStores = [24.0, 24.5, 25.0, 24.2, 24.8, 24.1, 24.6, 24.5];
    expect(jockeyStores).toHaveLength(8);
    expect(computeArithmeticAverage(jockeyStores)).toBe(24.4625);

    const guaibaStores = [26.0, 27.0, 26.5, 27.0, 26.5, 27.0];
    expect(guaibaStores).toHaveLength(6);
    expect(computeArithmeticAverage(guaibaStores)).toBe(26.6667);

    // Ignores missing stores cleanly
    expect(computeArithmeticAverage([25, null, 27, undefined])).toBe(26);
    expect(computeArithmeticAverage([null, undefined])).toBeNull();
  });

  it("computes BSS general and Total Energy Consumption (2026-01-01 real case)", () => {
    const bss1 = computeBssGeneralConsumption(26000, 4472);
    const bss2 = computeBssGeneralConsumption(1854, 0);
    const bss3 = computeBssGeneralConsumption(1114, 0);
    const bss4 = computeBssGeneralConsumption(385, 0);

    expect(bss1).toBe(30472);
    expect(computeBssGeneralConsumption(null, null)).toBeNull();

    const total = computeTotalEnergyConsumption([bss1, bss2, bss3, bss4]);
    expect(total).toBe(33825);
  });

  it("computes CAG % Energia and returns null when totalEnergy is 0", () => {
    // 2026-01-01 real case: 8000 / 33825 = 0.236511
    expect(computeCagEnergyPercent(8000, 33825)).toBe(0.236511);
    expect(computeCagEnergyPercent(8000, 0)).toBeNull();
  });

  it("computes CAG % Água with '-' / null when Consumo Geral = 0 (never 100%) and flags anomaly > 100%", () => {
    // 2026-01-01 real case: 50 / 320 = 0.15625 -> 15,63%
    const normal = computeCagWaterPercent(50, 320);
    expect(normal).toEqual({
      ratio: 0.15625,
      isAnomaly: false,
      display: "15,63%",
    });

    // 2026-03-10 real case where Consumo Geral == 0
    const divZero = computeCagWaterPercent(45, 0);
    expect(divZero).toEqual({
      ratio: null,
      isAnomaly: false,
      display: "-",
    });

    // Anomaly when CAG consumption > Consumo Geral
    const anomaly = computeCagWaterPercent(120, 100);
    expect(anomaly).toEqual({
      ratio: 1.2,
      isAnomaly: true,
      display: "120,00%",
    });
  });
});
