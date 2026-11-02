import {
  scenarioSchema,
  type Scenario,
  type ListingSnapshot,
  type RiskFinding,
  type CalculationResult,
  type ReportRevision,
  type ObservedValue,
  type ScoreFactor,
  type MarketReferenceSnapshot,
  type MarketAnalysis,
  type MarketComparable,
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

const geographyKey = (value: string) =>
  value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
const percentile = (sorted: number[], fraction: number) => {
  if (!sorted.length) return null;
  const position = (sorted.length - 1) * fraction;
  const lower = Math.floor(position),
    upper = Math.ceil(position);
  return sorted[lower] + (sorted[upper] - sorted[lower]) * (position - lower);
};

/** Builds a transparent asking-price comparison; it is not a valuation. */
export function deriveMarketAnalysis(
  subject: ReportRevision,
  source: MarketComparable[],
  computedAt = new Date().toISOString(),
): MarketAnalysis | null {
  const { snapshot } = subject;
  if (!snapshot.area || snapshot.area <= 0) return null;
  const subjectKey = geographyKey(snapshot.location);
  const nowMs = Date.parse(computedAt);
  let matched = source
    .filter((item) => {
      if (
        item.id === subject.propertyId ||
        geographyKey(item.sourceLabel).length === 0
      )
        return false;
      if (geographyKey(item.geography) !== subjectKey) return false;
      if (
        snapshot.propertyType === "unknown" ||
        item.propertyType !== snapshot.propertyType
      )
        return false;
      const areaRatio = item.area / snapshot.area!;
      if (areaRatio < 0.7 || areaRatio > 1.3) return false;
      if (
        snapshot.bedrooms !== null &&
        item.bedrooms !== null &&
        Math.abs(snapshot.bedrooms - item.bedrooms) > 1
      )
        return false;
      const observed = Date.parse(item.observedAt);
      return (
        Number.isFinite(observed) &&
        observed <= nowMs &&
        nowMs - observed <= 365 * 86400000
      );
    })
    .map((item) => ({ ...item, pricePerM2: item.price / item.area }));
  const unique = new Map<string, (typeof matched)[number]>();
  for (const item of matched) {
    const signature = `${geographyKey(item.geography)}|${item.propertyType}|${Math.round(item.price)}|${Math.round(item.area)}|${item.observedAt.slice(0, 10)}`;
    if (!unique.has(signature)) unique.set(signature, item);
  }
  matched = [...unique.values()];
  const allPerM2 = matched.map((item) => item.pricePerM2).sort((a, b) => a - b);
  const initialQ1 = percentile(allPerM2, 0.25),
    initialQ3 = percentile(allPerM2, 0.75);
  const lowerFence =
    initialQ1 !== null && initialQ3 !== null
      ? initialQ1 - 1.5 * (initialQ3 - initialQ1)
      : -Infinity;
  const upperFence =
    initialQ1 !== null && initialQ3 !== null
      ? initialQ3 + 1.5 * (initialQ3 - initialQ1)
      : Infinity;
  const beforeOutlierFilter = matched.length;
  if (matched.length >= 5)
    matched = matched.filter(
      (item) => item.pricePerM2 >= lowerFence && item.pricePerM2 <= upperFence,
    );
  const excludedOutlierCount = beforeOutlierFilter - matched.length;
  const perM2 = matched.map((item) => item.pricePerM2).sort((a, b) => a - b);
  const low = percentile(perM2, 0.25),
    median = percentile(perM2, 0.5),
    high = percentile(perM2, 0.75);
  const recentSampleSize = matched.filter(
    (item) => nowMs - Date.parse(item.observedAt) <= 90 * 86400000,
  ).length;
  const confidence: MarketAnalysis["confidence"] =
    matched.length >= 5 && recentSampleSize >= Math.ceil(matched.length * 0.7)
      ? "medium"
      : "low";
  const askingPricePerM2 = snapshot.price / snapshot.area;
  const estimatedPrice =
    median === null ? null : Math.round(median * snapshot.area);
  const rangeLow = low === null ? null : Math.round(low * snapshot.area);
  const rangeHigh = high === null ? null : Math.round(high * snapshot.area);
  const discountPercent = estimatedPrice
    ? Math.round(((estimatedPrice - snapshot.price) / estimatedPrice) * 1000) /
      10
    : null;
  const enough = matched.length >= 3;
  const belowRange = enough && low !== null && askingPricePerM2 < low;
  let conservativeCashFlow: number | null = null;
  try {
    conservativeCashFlow = calculate(
      preset(subject.scenario, "conservative"),
      snapshot,
      subject.risks,
    ).cashFlow;
  } catch {
    /* A blocked financing scenario cannot be called an opportunity. */
  }
  const financeOk = conservativeCashFlow !== null && conservativeCashFlow >= 0;
  const risksOk = !subject.risks.some(
    (risk) => risk.needsContractRent || risk.blocksFinancing,
  );
  const verdict: MarketAnalysis["verdict"] = !enough
    ? "insufficient-data"
    : belowRange
      ? confidence === "medium" && financeOk && risksOk
        ? "potential"
        : "review"
      : high !== null && askingPricePerM2 > high
        ? "above-range"
        : "within-range";
  const explanation =
    verdict === "insufficient-data"
      ? `Solo se encontraron ${matched.length} comparables recientes con la misma zona, tipología y superficie semejante; se necesitan al menos 3 para estimar un rango.`
      : verdict === "potential"
        ? `El precio anunciado queda por debajo del cuartil inferior de ${matched.length} anuncios comparables recientes. El flujo de caja sigue siendo no negativo en el escenario conservador y no hay alertas contractuales o hipotecarias detectadas; verifica el inmueble y los datos antes de decidir.`
        : verdict === "review" && belowRange
          ? `El precio anunciado queda por debajo del rango central, pero la muestra, su actualidad, los supuestos financieros o las alertas no permiten marcarlo como oportunidad con confianza.`
          : verdict === "above-range"
            ? `El precio anunciado supera el cuartil superior del rango estimado con ${matched.length} anuncios comparables.`
            : `El precio anunciado queda dentro del rango central estimado con ${matched.length} anuncios comparables.`;
  return {
    computedAt,
    geography: snapshot.location,
    propertyType: snapshot.propertyType,
    subjectArea: snapshot.area,
    subjectPrice: snapshot.price,
    askingPricePerM2: Math.round(askingPricePerM2),
    currentCashFlow: subject.result.cashFlow,
    conservativeCashFlow,
    estimatedPrice,
    rangeLow,
    rangeHigh,
    lowPricePerM2: low === null ? null : Math.round(low),
    medianPricePerM2: median === null ? null : Math.round(median),
    highPricePerM2: high === null ? null : Math.round(high),
    discountPercent,
    sampleSize: matched.length,
    excludedOutlierCount,
    recentSampleSize,
    confidence,
    verdict,
    comparables: matched.sort((a, b) =>
      b.observedAt.localeCompare(a.observedAt),
    ),
    explanation,
    warnings: [
      "Los comparables reflejan precios anunciados, no precios finales de compraventa.",
      "No se ajusta todavía por estado, planta, ascensor, eficiencia energética ni reforma; verifica que los inmuebles sean realmente equivalentes.",
      "El resultado es un filtro orientativo, no una tasación ni asesoramiento de inversión.",
      ...(confidence === "low"
        ? ["La muestra es pequeña o contiene datos con más de 90 días."]
        : []),
    ],
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
    marketReference?: MarketReferenceSnapshot;
  },
): ReportRevision {
  const risks = detectRisks(snapshot),
    scenario = input
      ? scenarioSchema.parse(input)
      : defaultScenario(snapshot, risks);
  const result = calculate(scenario, snapshot, risks);
  if (identity.marketReference)
    result.warnings.push(
      "La renta del escenario se calculó a partir de una referencia zonal que elegiste. No equivale a una renta contractual ni a una oferta para este inmueble.",
    );
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
  const marketEvidence = identity.marketReference;
  value(
    "rent",
    scenario.rent,
    scenario.rent === null
      ? "default"
      : marketEvidence
        ? "market"
        : rentUnchanged && snapshot.rentSource === "example"
          ? "example"
          : "user",
    marketEvidence
      ? `Referencia ${marketEvidence.sourceLabel} · ${marketEvidence.geography} · ${marketEvidence.asOf}`
      : "Renta aportada o desconocida; sin proveedor de mercado",
    marketEvidence ? ["area", "marketReference.rentPerM2"] : undefined,
  );
  if (marketEvidence) {
    values.rent.observedAt = `${marketEvidence.asOf}T00:00:00.000Z`;
    values.rent.confidence =
      marketEvidence.sampleSize !== null && marketEvidence.sampleSize >= 30
        ? "medium"
        : "low";
  }
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
  const { marketReference: _marketReference, ...reportIdentity } = identity;
  return {
    ...reportIdentity,
    parentId: identity.parentId ?? null,
    marketReference: marketEvidence ?? null,
    snapshot,
    scenario,
    result,
    risks,
    values,
    summary,
    checklist,
    marketAnalysis: null,
  };
}
