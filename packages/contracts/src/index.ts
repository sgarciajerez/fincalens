import { z } from "zod";

export const scenarioSchema = z.object({
  price: z.number().finite().min(1000).max(100_000_000),
  rent: z.number().finite().min(0).max(100_000).nullable(),
  finance: z.number().finite().min(0).max(90).default(80),
  interest: z.number().finite().min(0).max(20).default(3.2),
  years: z.number().int().min(1).max(40).default(30),
  renovation: z.number().finite().min(0).max(10_000_000).default(0),
  expensePercent: z.number().finite().min(0).max(95).default(15),
  taxPercent: z.number().finite().min(0).max(30).default(6),
  agencyCosts: z.number().finite().min(0).max(1_000_000).default(350),
  valuationCosts: z.number().finite().min(0).max(100_000).default(400),
  hypotheticalFinancing: z.boolean().default(false),
});
export type Scenario = z.infer<typeof scenarioSchema>;
export const sourceSchema = z.enum([
  "listing",
  "user",
  "example",
  "market",
  "derived",
  "default",
]);
export type ValueSource = z.infer<typeof sourceSchema>;
export interface ObservedValue<T> {
  value: T | null;
  source: ValueSource;
  observedAt: string;
  confidence: "high" | "medium" | "low" | "unknown";
  evidence: string;
  dependsOn?: string[];
}
export const snapshotSchema = z.object({
  schemaVersion: z.literal("1").default("1"),
  portal: z.enum(["idealista", "manual", "example"]),
  listingId: z.string().max(100).nullable().default(null),
  url: z.string().url().max(2048).nullable().default(null),
  capturedAt: z.string().datetime(),
  extractorVersion: z.string().max(30).default("manual-1"),
  title: z.string().trim().min(1).max(160),
  propertyType: z
    .enum(["flat", "house", "room", "other", "unknown"])
    .default("unknown"),
  location: z.string().trim().max(200).default("Ubicación no informada"),
  price: z.number().finite().min(1000).max(100_000_000),
  area: z.number().finite().positive().max(100_000).nullable().default(null),
  bedrooms: z.number().int().min(0).max(100).nullable().default(null),
  bathrooms: z.number().int().min(0).max(100).nullable().default(null),
  description: z.string().max(30000).default(""),
  features: z.array(z.string().max(500)).max(80).default([]),
  source: z.enum(["listing", "user", "example"]),
  rent: z.number().finite().min(0).max(100_000).nullable().default(null),
  rentSource: z.enum(["user", "example", "unknown"]).default("unknown"),
  previousAdvertisedPrice: z.number().positive().nullable().default(null),
});
export type ListingSnapshot = z.infer<typeof snapshotSchema>;
export const propertyTypeSchema = z.enum([
  "flat",
  "house",
  "room",
  "other",
  "unknown",
]);
export type PropertyType = z.infer<typeof propertyTypeSchema>;
export interface RiskFinding {
  id: string;
  severity: "info" | "warning" | "critical";
  title: string;
  evidence: string;
  blocksFinancing: boolean;
  needsContractRent: boolean;
}
export interface ScoreFactor {
  id: string;
  label: string;
  value: number | null;
  weight: number;
  contribution: number | null;
}
export interface CalculationResult {
  version: string;
  loan: number;
  entry: number;
  payment: number;
  tax: number;
  notary: number;
  valuation: number;
  purchaseCosts: number;
  totalInvestment: number;
  capital: number;
  grossYield: number | null;
  netYield: number | null;
  cashFlow: number | null;
  cashOnCash: number | null;
  breakEvenRent: number;
  paybackYears: number | null;
  pricePerSquareMeter: number | null;
  equilibriumPrice: number | null;
  score: number | null;
  factors: ScoreFactor[];
  decision: "incomplete" | "restricted" | "caution" | "review" | "interesting";
  confidence: "low" | "medium";
  warnings: string[];
  sensitivity: { interest: number; payment: number; cashFlow: number | null }[];
}
export interface ChecklistItem {
  id: string;
  text: string;
}
export interface ReportRevision {
  id: string;
  propertyId: string;
  createdAt: string;
  parentId: string | null;
  snapshot: ListingSnapshot;
  scenario: Scenario;
  result: CalculationResult;
  risks: RiskFinding[];
  values: Record<string, ObservedValue<number>>;
  summary: string;
  checklist: ChecklistItem[];
  marketReference: MarketReferenceSnapshot | null;
  marketAnalysis: MarketAnalysis | null;
}
export interface PropertySummary {
  id: string;
  reportId: string;
  title: string;
  location: string;
  price: number;
  area: number | null;
  rent: number | null;
  source: ListingSnapshot["source"];
  favorite: boolean;
  notes: string;
  score: number | null;
  netYield: number | null;
  cashFlow: number | null;
  updatedAt: string;
  observations: { price: number; observedAt: string }[];
}
export interface AnalysisJob {
  id: string;
  status: "queued" | "running" | "completed" | "completed_partial" | "failed";
  reportId: string | null;
  error: string | null;
  createdAt: string;
}
export const analysisInputSchema = z.object({
  snapshot: snapshotSchema,
  scenario: scenarioSchema.optional(),
});
export type AnalysisInput = z.infer<typeof analysisInputSchema>;

export const marketReferenceInputSchema = z.object({
  geography: z.string().trim().min(2).max(160),
  level: z.enum(["neighborhood", "district", "municipality", "province"]),
  rentPerM2: z.number().finite().min(0.1).max(200),
  asOf: z.string().date(),
  sampleSize: z.number().int().min(1).max(1_000_000).nullable().default(null),
  dispersion: z.number().finite().min(0).max(100).nullable().default(null),
  sourceLabel: z.string().trim().min(2).max(120),
  usageTerms: z.string().trim().min(12).max(500),
});
export type MarketReferenceInput = z.infer<typeof marketReferenceInputSchema>;
export interface MarketReferenceSnapshot extends MarketReferenceInput {
  id: string;
  importedAt: string;
}
export const comparableListingInputSchema = z.object({
  geography: z.string().trim().min(2).max(160),
  propertyType: propertyTypeSchema,
  price: z.number().finite().min(1000).max(100_000_000),
  area: z.number().finite().positive().max(100_000),
  bedrooms: z.number().int().min(0).max(100).nullable().default(null),
  observedAt: z.string().date(),
  sourceLabel: z.string().trim().min(2).max(120),
  usageTerms: z.string().trim().min(12).max(500),
});
export type ComparableListingInput = z.infer<
  typeof comparableListingInputSchema
>;
export interface ComparableListingSnapshot extends ComparableListingInput {
  id: string;
  importedAt: string;
}
export interface MarketComparable {
  id: string;
  geography: string;
  price: number;
  area: number;
  bedrooms: number | null;
  pricePerM2: number;
  observedAt: string;
  sourceLabel: string;
  propertyType: PropertyType;
  usageTerms: string;
}
export interface MarketAnalysis {
  computedAt: string;
  geography: string;
  propertyType: PropertyType;
  subjectArea: number;
  subjectPrice: number;
  askingPricePerM2: number;
  currentCashFlow: number | null;
  conservativeCashFlow: number | null;
  estimatedPrice: number | null;
  rangeLow: number | null;
  rangeHigh: number | null;
  lowPricePerM2: number | null;
  medianPricePerM2: number | null;
  highPricePerM2: number | null;
  discountPercent: number | null;
  sampleSize: number;
  excludedOutlierCount: number;
  recentSampleSize: number;
  confidence: "low" | "medium";
  verdict:
    | "insufficient-data"
    | "potential"
    | "review"
    | "within-range"
    | "above-range";
  comparables: MarketComparable[];
  explanation: string;
  warnings: string[];
}
