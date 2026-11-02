import { snapshotSchema, type ListingSnapshot } from "@fincalens/contracts";

export interface RawCapture {
  url: string;
  title: string;
  location: string;
  price: string;
  features: string[];
  description: string;
  previousPrice: string;
}
/** Serialized into an isolated content-script world: keep all dependencies inside this function. */
export function captureIdealistaDocument(): RawCapture {
  const text = (selector: string) =>
    document.querySelector(selector)?.textContent?.trim() || "";
  const price = document.querySelector(".info-data-price")?.childNodes;
  const priceText = price
    ? [...price]
        .map((n) => (n.nodeType === Node.TEXT_NODE ? n.textContent : ""))
        .join(" ")
        .trim()
    : "";
  return {
    url: location.href,
    title: text(".main-info__title-main") || text("h1"),
    location: text(".main-info__title-minor"),
    price: priceText || text(".info-data-price"),
    previousPrice:
      text(".pricedown_price") || text(".info-data-price .pricedown"),
    features: [
      ...document.querySelectorAll(
        ".details-property_features li,.info-features span",
      ),
    ]
      .map((el) => el.textContent?.trim() || "")
      .filter(Boolean),
    description:
      text(".comment .adCommentsLanguage p") ||
      text(".comment .adCommentsLanguage") ||
      text(".comment"),
  };
}
export function isIdealistaListing(url: string): boolean {
  try {
    const u = new URL(url);
    return (
      u.protocol === "https:" &&
      /^(www\.)?idealista\.com$/.test(u.hostname) &&
      /^\/inmueble\/\d+\/?$/.test(u.pathname)
    );
  } catch {
    return false;
  }
}
const number = (text: string) => {
  const match = text.match(/[\d][\d.\s]*(?:,\d+)?/);
  return match
    ? Number(match[0].replace(/[.\s]/g, "").replace(",", "."))
    : null;
};
export function normalizeIdealista(
  raw: RawCapture,
  now = new Date().toISOString(),
): ListingSnapshot {
  if (!isIdealistaListing(raw.url))
    throw new Error("Abre un anuncio de vivienda de Idealista en España.");
  const url = new URL(raw.url),
    features = raw.features.slice(0, 80).map((f) => f.slice(0, 500));
  const find = (pattern: RegExp) => features.find((f) => pattern.test(f)) || "";
  const price = number(raw.price);
  if (!price || price < 1000)
    throw new Error(
      "No se ha podido leer el precio. Revisa el anuncio o usa la entrada manual.",
    );
  // Only structured feature fields establish numeric attributes; never parse legal years from prose.
  return snapshotSchema.parse({
    schemaVersion: "1",
    portal: "idealista",
    listingId: url.pathname.match(/\d+/)?.[0],
    url: `https://www.idealista.com${url.pathname.replace(/\/?$/, "/")}`,
    capturedAt: now,
    extractorVersion: "idealista-1.0.0",
    title: raw.title.slice(0, 160),
    propertyType: /\b(casa|chalet|villa)\b/i.test(
      `${raw.title} ${features.join(" ")}`,
    )
      ? "house"
      : /\b(habitaci[oó]n|room)\b/i.test(`${raw.title} ${features.join(" ")}`)
        ? "room"
        : /\b(piso|apartamento|[áa]tico|d[uú]plex)\b/i.test(
              `${raw.title} ${features.join(" ")}`,
            )
          ? "flat"
          : "unknown",
    location: raw.location.slice(0, 200),
    price,
    area: number(find(/m² construidos/i)),
    bedrooms: number(find(/habitaciones|\bhab\./i)),
    bathrooms: number(find(/baños?/i)),
    floor:
      find(/planta/i).match(
        /(?:planta\s*)?([\wªº.-]+)(?:\s+exterior)?/i,
      )?.[1] || null,
    hasLift: features.some((feature) => /\bascensor\b/i.test(feature))
      ? !features.some((feature) =>
          /sin ascensor|no dispone de ascensor/i.test(feature),
        )
      : null,
    energyRating:
      find(/certificado energético/i).match(
        /(?:consumo|emisiones)?\s*([A-G])\b/i,
      )?.[1] || null,
    buildingYear: number(find(/año de construcción/i)),
    areaUsable: number(find(/m² útiles/i)),
    condition: /a reformar|para reformar/i.test(features.join(" "))
      ? "to-renovate"
      : "unknown",
    description: raw.description.slice(0, 30000),
    features,
    source: "listing",
    rent: null,
    rentSource: "unknown",
    previousAdvertisedPrice: number(raw.previousPrice),
  });
}
