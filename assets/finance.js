/** Illustrative model: not a valuation or a jurisdiction-specific tax engine. */
export function mortgagePayment(principal, annualPercent, years = 30) {
  if (
    !Number.isFinite(principal) ||
    principal < 0 ||
    !Number.isFinite(annualPercent) ||
    annualPercent < 0 ||
    !Number.isFinite(years) ||
    years <= 0
  )
    throw new RangeError("Invalid mortgage parameters");
  if (principal === 0) return 0;
  const rate = annualPercent / 1200;
  return rate === 0
    ? principal / (years * 12)
    : (principal * rate) / (1 - (1 + rate) ** (-years * 12));
}

export function calculate({
  price,
  rent,
  finance = 80,
  interest = 3.2,
  renovation = 0,
}) {
  if (
    ![price, finance, interest, renovation].every(Number.isFinite) ||
    price < 1000 ||
    finance < 0 ||
    finance > 90 ||
    interest < 0 ||
    interest > 15 ||
    renovation < 0 ||
    (rent !== null && (!Number.isFinite(rent) || rent < 0))
  )
    throw new RangeError("Invalid scenario");
  const loan = (price * finance) / 100;
  const mortgage = mortgagePayment(loan, interest);
  const clamp = (n) => Math.min(6000, Math.max(1200, n));
  const notary = Math.round(
    (Math.round(clamp(price * 0.003)) + Math.round(clamp(price * 0.005))) / 2,
  );
  const tax = price * 0.06;
  const valuation = loan > 0 ? 400 : 0;
  const costs = tax + notary + 350 + valuation;
  const total = price + costs + renovation;
  const entry = price - loan;
  const capital = entry + costs + renovation;
  const cf = rent === null ? null : rent * 0.85 - mortgage;
  const netYield = rent === null ? null : ((rent * 12 * 0.85) / total) * 100;
  const score =
    cf === null
      ? null
      : Math.max(0, Math.min(100, Math.round(netYield * 10 + cf / 15)));
  return {
    price,
    rent,
    loan,
    entry,
    mortgage,
    notary,
    tax,
    valuation,
    total,
    capital,
    cf,
    netYield,
    grossYield: rent === null ? null : ((rent * 12) / total) * 100,
    coc: cf === null ? null : ((cf * 12) / capital) * 100,
    breakEven: mortgage / 0.85,
    score,
  };
}
