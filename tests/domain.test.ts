import { describe, expect, it } from "vitest";
import {
  createReport,
  calculate,
  defaultScenario,
  detectRisks,
  mortgagePayment,
  preset,
} from "../packages/domain/src/index.js";
import { examples } from "../packages/fixtures/src/index.js";

describe("motor financiero versionado", () => {
  it("calcula una cuota francesa y el límite de interés cero", () => {
    expect(mortgagePayment(200_000, 0, 20)).toBeCloseTo(833.3333, 3);
    expect(mortgagePayment(200_000, 3.2, 30)).toBeCloseTo(864.93, 1);
  });

  it("no presenta una renta de mercado como observada cuando se desconoce", () => {
    const snapshot = {
      ...examples[0],
      rent: null,
      rentSource: "unknown" as const,
    };
    const report = createReport(snapshot, undefined, {
      id: "r1",
      propertyId: "p1",
      createdAt: snapshot.capturedAt,
    });
    expect(report.result.netYield).toBeNull();
    expect(report.result.score).toBeNull();
    expect(report.values.rent).toMatchObject({
      value: null,
      source: "default",
      confidence: "unknown",
    });
    expect(report.result.warnings.join(" ")).toContain(
      "Sin alquiler informado",
    );
  });

  it("detecta restricciones hipotecarias y exige confirmación para simular financiación", () => {
    const snapshot = examples.find(
      (example) => example.listingId === "example-3",
    )!;
    const risks = detectRisks(snapshot);
    expect(risks.some((risk) => risk.blocksFinancing)).toBe(true);
    expect(defaultScenario(snapshot, risks).finance).toBe(0);
    expect(() =>
      calculate(
        { ...defaultScenario(snapshot, risks), finance: 80 },
        snapshot,
        risks,
      ),
    ).toThrow(/restringida/);
    expect(
      calculate(
        {
          ...defaultScenario(snapshot, risks),
          finance: 80,
          hypotheticalFinancing: true,
        },
        snapshot,
        risks,
      ).decision,
    ).toBe("restricted");
  });

  it("aplica presets independientes sobre el escenario base", () => {
    const base = defaultScenario(examples[0]);
    const optimistic = preset(base, "optimistic");
    expect(optimistic.price).toBe(Math.round(base.price * 0.95));
    expect(preset(base, "base")).toEqual(base);
    expect(preset(base, "conservative").price).toBe(base.price);
  });
});
