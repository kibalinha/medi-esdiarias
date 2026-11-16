import { describe, expect, it } from "vitest";
import {
  evaluateCagWaterAnomaly,
  evaluateReadingAlerts,
} from "@/domain/alerts";

describe("evaluateReadingAlerts — Condutivímetro", () => {
  const condMeter = {
    code: "cag_condutivimetro",
    label: "CAG - Condutivimetro",
    reading_kind: "quality" as const,
    unit: "µS/cm",
    threshold: {
      warning_min: 700,
      critical_min: 1000,
      teto_value: null,
    },
  };

  it("returns ok when conductivity < 700 (e.g. 660 on 2026-01-01)", () => {
    const res = evaluateReadingAlerts({ meter: condMeter, rawValue: 660 });
    expect(res.highestSeverity).toBe("ok");
    expect(res.alerts).toHaveLength(0);

    const edge = evaluateReadingAlerts({ meter: condMeter, rawValue: 699.9 });
    expect(edge.highestSeverity).toBe("ok");
  });

  it("returns warning (CONDUTIVIMETRO_ALTO) when 700 <= value <= 1000 (e.g. 753 on 2026-01-02)", () => {
    for (const val of [700, 753, 1000]) {
      const res = evaluateReadingAlerts({ meter: condMeter, rawValue: val });
      expect(res.highestSeverity).toBe("warning");
      expect(res.alerts).toHaveLength(1);
      expect(res.alerts[0].rule_code).toBe("CONDUTIVIMETRO_ALTO");
      expect(res.alerts[0].notify_critical).toBe(false);
    }
  });

  it("returns critical (CONDUTIVIMETRO_CRITICO) with notify_critical=true when value > 1000", () => {
    for (const val of [1000.1, 1050]) {
      const res = evaluateReadingAlerts({ meter: condMeter, rawValue: val });
      expect(res.highestSeverity).toBe("critical");
      expect(res.alerts).toHaveLength(1);
      expect(res.alerts[0].rule_code).toBe("CONDUTIVIMETRO_CRITICO");
      expect(res.alerts[0].notify_critical).toBe(true);
    }
  });
});

describe("evaluateReadingAlerts — Tetos de Demanda BSS 1..4", () => {
  const demandCases = [
    { code: "bss1_demanda_fp", label: "Demanda BSS 1 - Fora Ponta", teto: 2800 },
    { code: "bss1_demanda_p", label: "Demanda BSS 1 - Ponta", teto: 2600 },
    { code: "bss2_demanda_fp", label: "Demanda BSS 2 - Fora Ponta", teto: 500 },
    { code: "bss2_demanda_p", label: "Demanda BSS 2 - Ponta", teto: 500 },
    { code: "bss3_demanda_fp", label: "Demanda BSS 3 - Fora Ponta", teto: 200 },
    { code: "bss3_demanda_p", label: "Demanda BSS 3 - Ponta", teto: 200 },
    { code: "bss4_demanda_fp", label: "Demanda BSS 4 - Fora Ponta", teto: 340 },
    { code: "bss4_demanda_p", label: "Demanda BSS 4 - Ponta", teto: 340 },
  ];

  for (const c of demandCases) {
    const meter = {
      code: c.code,
      label: c.label,
      reading_kind: "instant" as const,
      unit: "kW",
      threshold: {
        warning_min: c.teto * 0.9,
        critical_min: c.teto,
        teto_value: c.teto,
      },
    };

    it(`${c.code} (teto ${c.teto} kW): <90% ok, 90..99.9% warning, >=100% critical`, () => {
      const okRes = evaluateReadingAlerts({
        meter,
        rawValue: c.teto * 0.9 - 1,
      });
      expect(okRes.highestSeverity).toBe("ok");
      expect(okRes.alerts).toHaveLength(0);

      const warnRes = evaluateReadingAlerts({
        meter,
        rawValue: c.teto * 0.9,
      });
      expect(warnRes.highestSeverity).toBe("warning");
      expect(warnRes.alerts[0].rule_code).toBe("DEMANDA_ATENCAO");
      expect(warnRes.alerts[0].notify_critical).toBe(false);

      const critAtCeiling = evaluateReadingAlerts({
        meter,
        rawValue: c.teto,
      });
      expect(critAtCeiling.highestSeverity).toBe("critical");
      expect(critAtCeiling.alerts[0].rule_code).toBe("DEMANDA_TETO");
      expect(critAtCeiling.alerts[0].notify_critical).toBe(true);

      const critAbove = evaluateReadingAlerts({
        meter,
        rawValue: c.teto + 15,
      });
      expect(critAbove.highestSeverity).toBe("critical");
      expect(critAbove.alerts[0].rule_code).toBe("DEMANDA_TETO");
    });
  }

  it("matches real 2026-01-03 BSS 1 readings (AY=2614 warning, BA=2600 critical)", () => {
    const bss1Fp = {
      code: "bss1_demanda_fp",
      label: "Demanda BSS 1 - Fora Ponta",
      reading_kind: "instant" as const,
      unit: "kW",
      threshold: { warning_min: 2520, critical_min: 2800, teto_value: 2800 },
    };
    const bss1P = {
      code: "bss1_demanda_p",
      label: "Demanda BSS 1 - Ponta",
      reading_kind: "instant" as const,
      unit: "kW",
      threshold: { warning_min: 2340, critical_min: 2600, teto_value: 2600 },
    };

    expect(
      evaluateReadingAlerts({ meter: bss1Fp, rawValue: 2614 }).highestSeverity,
    ).toBe("warning");
    expect(
      evaluateReadingAlerts({ meter: bss1P, rawValue: 2600 }).highestSeverity,
    ).toBe("critical");
  });
});

describe("evaluateReadingAlerts — Queda sem flag & CAG Água anomalia", () => {
  it("generates QUEDA_MEDIDOR warning when isDropWithoutFlag is true", () => {
    const res = evaluateReadingAlerts({
      meter: {
        code: "agua_reuso",
        label: "Reuso (Estação Elevatória)",
        reading_kind: "cumulative",
        unit: "m³",
        threshold: null,
      },
      rawValue: 4,
      previousValue: 9999,
      isDropWithoutFlag: true,
    });

    expect(res.highestSeverity).toBe("warning");
    expect(res.alerts).toHaveLength(1);
    expect(res.alerts[0].rule_code).toBe("QUEDA_MEDIDOR");
    expect(res.alerts[0].notify_critical).toBe(false);
  });

  it("flags CAG_AGUA_ANOMALIA only when CAG water > total water and total > 0", () => {
    expect(evaluateCagWaterAnomaly(50, 320)).toBeNull();
    expect(evaluateCagWaterAnomaly(50, 0)).toBeNull();
    const anomaly = evaluateCagWaterAnomaly(120, 100);
    expect(anomaly).not.toBeNull();
    expect(anomaly?.rule_code).toBe("CAG_AGUA_ANOMALIA");
    expect(anomaly?.severity).toBe("warning");
  });
});
