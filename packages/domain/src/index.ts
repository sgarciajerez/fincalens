import {
  scenarioSchema,
  type Scenario,
  type ListingSnapshot,
  type RiskFinding,
  type CalculationResult,
  type ReportRevision,
  type ObservedValue,
  type ScoreFactor,
} from "@fincalens/contracts";

export const CALC_VERSION = "1.0.0";
const clamp = (n: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, n));
export function mortgagePayment(
  principal: number,
  annualPercent: number,
  years: number,
): number {
  if (
    ![principal, annualPercent, years].every(Number.isFinite) ||
    principal < 0 ||
    annualPercent < 0 ||
    years <= 0
  )
    throw new RangeError("Parámetros hipotecarios inválidos");
  if (!principal) return 0;
  const rate = annualPercent / 1200,
    months = years * 12;
  return rate === 0
    ? principal / months
    : (principal * rate) / -Math.expm1(-months * Math.log1p(rate));
}

export function detectRisks(snapshot: ListingSnapshot): RiskFinding[] {
  const text = `${snapshot.features.join(". ")}. ${snapshot.description}`;
  const findings: RiskFinding[] = [];
  const add = (
    id: string,
    title: string,
    pattern: RegExp,
    severity: RiskFinding["severity"],
    blocksFinancing = false,
    needsContractRent = false,
  ) => {
    const match = pattern.exec(text);
    if (match)
      findings.push({
        id,
        title,
        evidence: text
          .slice(
            Math.max(0, match.index - 45),
            Math.min(text.length, match.index + match[0].length + 120),
          )
          .trim(),
        severity,
        blocksFinancing,
        needsContractRent,
      });
  };
  add(
    "mortgage-restricted",
    "El anuncio declara restricciones hipotecarias",
    /no (?:podr[ií]a|puede|se puede) (?:ser )?hipotecad[oa]|no (?:podr[ií]a|puede) constituirse financiaci[oó]n hipotecaria|sin posibilidad de (?:financiaci[oó]n )?hipoteca|no (?:admite|es posible) (?:una )?hipoteca/i,
    "critical",
    true,
  );
  add(
    "protected",
    "Vivienda protegida: comprobar condiciones",
    /vivienda de protecci[oó]n oficial|\bVPO\b/i,
    "critical",
    false,
    true,
  );
  add(
    "rented",
    "Vivienda arrendada: comprobar contrato y renta",
    /(?:se transmite|transmitir[aá]) arrendad[oa]|alquilad[oa][, ]|con inquilinos|arrendado a tercero/i,
    "warning",
    false,
    true,
  );
  add(
    "no-lift",
    "Ausencia de ascensor declarada",
    /sin ascensor|no dispone de ascensor/i,
    "warning",
  );
  add(
    "visits",
    "Revisar las condiciones de visita",
    /no (?:se puede|es posible) visitar|impedimentos para que el inmueble pueda ser visitado/i,
    "warning",
  );
  add(
    "bare-ownership",
    "Transmisión de nuda propiedad",
    /nuda propiedad/i,
    "critical",
    true,
    true,
  );
  return findings;
}

export function defaultScenario(
  snapshot: ListingSnapshot,
  risks = detectRisks(snapshot),
): Scenario {
  return scenarioSchema.parse({
    price: snapshot.price,
    rent: snapshot.rent,
    finance: risks.some((r) => r.blocksFinancing) ? 0 : 80,
  });
}

export function calculate(
  input: Scenario,
  snapshot?: ListingSnapshot,
  risks: RiskFinding[] = [],
): CalculationResult {
  const s = scenarioSchema.parse(input);
  if (
    risks.some((r) => r.blocksFinancing) &&
    s.finance > 0 &&
    !s.hypotheticalFinancing
  )
    throw new RangeError(
      "La financiación está restringida. Usa compra al contado o confirma un escenario hipotético.",
    );
  const loan = (s.price * s.finance) / 100,
    entry = s.price - loan;
  const payment = mortgagePayment(loan, s.interest, s.years);
  const notary = Math.round(
    (Math.round(clamp(s.price * 0.003, 1200, 6000)) +
      Math.round(clamp(s.price * 0.005, 1200, 6000))) /
      2,
  );
  const tax = (s.price * s.taxPercent) / 100,
    valuation = loan > 0 ? s.valuationCosts : 0;
  const purchaseCosts = tax + notary + s.agencyCosts + valuation,
    totalInvestment = s.price + purchaseCosts + s.renovation,
    capital = entry + purchaseCosts + s.renovation;
  const factor = 1 - s.expensePercent / 100;
  const cashFlow = s.rent === null ? null : s.rent * factor - payment;
  const netYield =
    s.rent === null ? null : ((12 * s.rent * factor) / totalInvestment) * 100;
  // Gross yield is conventionally measured against purchase price; net yield
  // below includes acquisition and renovation capital in its denominator.
  const grossYield = s.rent === null ? null : ((12 * s.rent) / s.price) * 100;
  const cashOnCash =
    cashFlow === null ? null : ((12 * cashFlow) / capital) * 100;
  // Published financial policy v1: equal weighting, no invented market/condition factors.
  const yieldFactor =
    netYield === null ? null : clamp((netYield / 8) * 100, 0, 100);
  const cashFactor =
    cashOnCash === null ? null : clamp(50 + cashOnCash * 5, 0, 100);
  const factors: ScoreFactor[] = [
    {
      id: "net-yield",
      label: "Rentabilidad operativa (8 % → 100 puntos)",
      value: yieldFactor,
      weight: 0.5,
      contribution: yieldFactor === null ? null : yieldFactor * 0.5,
    },
    {
      id: "cash-return",
      label: "Retorno de caja (0 % → 50 puntos; 10 % → 100)",
      value: cashFactor,
      weight: 0.5,
      contribution: cashFactor === null ? null : cashFactor * 0.5,
    },
  ];
  const score = factors.some((f) => f.value === null)
    ? null
    : Math.round(factors.reduce((sum, f) => sum + (f.contribution || 0), 0));
  const restricted = risks.some((r) => r.blocksFinancing);
  const contractReview = risks.some((r) => r.needsContractRent);
  const decision = restricted
    ? "restricted"
    : cashFlow === null
      ? "incomplete"
      : cashFlow < 0
        ? "caution"
        : !contractReview && score !== null && score >= 70
          ? "interesting"
          : "review";
  const warnings = [
    "Impuesto de compra y gastos configurados como supuestos; no se ha aplicado normativa fiscal autonómica.",
  ];
  if (s.rent === null)
    warnings.push(
      "Sin alquiler informado: no se calculan rentabilidades ni puntuación financiera.",
    );
  if (s.hypotheticalFinancing)
    warnings.push(
      "Financiación hipotética: no implica que exista una oferta hipotecaria.",
    );
  if (snapshot?.rentSource === "user")
    warnings.push(
      "Alquiler aportado por el usuario; no verificado con una fuente de mercado.",
    );
  if (risks.some((r) => r.needsContractRent))
    warnings.push(
      "Comprueba contrato y restricciones antes de aplicar una renta libre de mercado.",
    );
  const equilibriumPrice =
    cashFlow !== null && cashFlow < 0 && loan > 0
      ? (s.rent! * factor) /
        mortgagePayment(s.finance / 100, s.interest, s.years)
      : null;
  return {
    version: CALC_VERSION,
    loan,
    entry,
    payment,
    tax,
    notary,
    valuation,
    purchaseCosts,
    totalInvestment,
    capital,
    grossYield,
    netYield,
    cashFlow,
    cashOnCash,
    breakEvenRent: payment / factor,
    paybackYears:
      cashFlow !== null && cashFlow > 0 ? capital / (cashFlow * 12) : null,
    pricePerSquareMeter: snapshot?.area ? s.price / snapshot.area : null,
    equilibriumPrice,
    score,
    factors,
    decision,
    confidence:
      !snapshot || snapshot.source === "example" || s.rent === null
        ? "low"
        : "medium",
    warnings,
    sensitivity: [3, 4, 5, 6].map((interest) => {
      const q = mortgagePayment(loan, interest, s.years);
      return {
        interest,
        payment: q,
        cashFlow: s.rent === null ? null : s.rent * factor - q,
      };
    }),
  };
}

export function preset(
  base: Scenario,
  mode: "base" | "optimistic" | "conservative",
): Scenario {
  if (mode === "base") return { ...base };
  return mode === "optimistic"
    ? {
        ...base,
        price: Math.round(base.price * 0.95),
        renovation: Math.round(base.renovation * 0.85),
        rent: base.rent === null ? null : Math.round(base.rent * 1.1),
        interest: Math.max(0, base.interest - 0.3),
      }
    : {
        ...base,
        renovation: Math.round(base.renovation * 1.2),
        rent: base.rent === null ? null : Math.round(base.rent * 0.9),
        interest: Math.min(20, base.interest + 0.5),
      };
}

export function createReport(
  snapshot: ListingSnapshot,
  input: Scenario | undefined,
  identity: {
    id: string;
    propertyId: string;
    createdAt: string;
    parentId?: string;
  },
): ReportRevision {
  const risks = detectRisks(snapshot),
    scenario = input
      ? scenarioSchema.parse(input)
      : defaultScenario(snapshot, risks);
  const result = calculate(scenario, snapshot, risks);
  const values: ReportRevision["values"] = {};
  const value = (
    key: string,
    n: number | null,
    source: ObservedValue<number>["source"],
    evidence: string,
    dependsOn?: string[],
  ) => {
    values[key] = {
      value: n,
      source,
      evidence,
      observedAt: snapshot.capturedAt,
      confidence:
        source === "example"
          ? "low"
          : n === null
            ? "unknown"
            : source === "listing"
              ? "high"
              : "medium",
      ...(dependsOn ? { dependsOn } : {}),
    };
  };
  value(
    "listingPrice",
    snapshot.price,
    snapshot.source,
    "Precio capturado o aportado",
  );
  value(
    "area",
    snapshot.area,
    snapshot.source,
    "Superficie construida declarada; no certificada",
  );
  value(
    "price",
    scenario.price,
    scenario.price === snapshot.price ? snapshot.source : "user",
    "Precio del escenario",
  );
  const rentUnchanged = scenario.rent === snapshot.rent;
  value(
    "rent",
    scenario.rent,
    scenario.rent === null
      ? "default"
      : rentUnchanged && snapshot.rentSource === "example"
        ? "example"
        : "user",
    "Renta aportada o desconocida; sin proveedor de mercado",
  );
  value(
    "netYield",
    result.netYield,
    "derived",
    "Resultado operativo / inversión total",
    ["price", "rent", "renovation", "taxPercent", "expensePercent"],
  );
  value("cashFlow", result.cashFlow, "derived", "Alquiler − gastos − cuota", [
    "price",
    "rent",
    "finance",
    "interest",
    "years",
    "expensePercent",
  ]);
  value(
    "cashOnCash",
    result.cashOnCash,
    "derived",
    "Flujo anual / capital inicial",
    ["cashFlow", "price", "finance", "renovation", "taxPercent"],
  );
  const summary =
    result.decision === "restricted"
      ? "El anuncio contiene condiciones que requieren comprobación antes de valorar la operación."
      : result.cashFlow === null
        ? "Falta el alquiler de referencia para valorar el rendimiento. Puedes completar el informe sin inventar datos de mercado."
        : result.cashFlow < 0
          ? "Los ingresos previstos no cubren todos los gastos y la cuota en este escenario. Revisa los supuestos y el capital que tendrías que aportar."
          : "El escenario cubre la cuota y los gastos previstos. Contrasta las rentas, los costes y la documentación antes de decidir.";
  const checklist = [
    { id: "registry", text: "Revisar nota simple, cargas y titularidad." },
    { id: "costs", text: "Confirmar IBI, comunidad y derramas pendientes." },
    {
      id: "condition",
      text: "Comprobar instalaciones, humedades y estado real.",
    },
    {
      id: "rent",
      text: "Contrastar la renta y las condiciones de alquiler aplicables.",
    },
    ...risks.map((r) => ({
      id: `risk:${r.id}`,
      text: `Comprobar: ${r.title.toLocaleLowerCase("es")}.`,
    })),
  ];
  return {
    ...identity,
    parentId: identity.parentId ?? null,
    snapshot,
    scenario,
    result,
    risks,
    values,
    summary,
    checklist,
  };
}
