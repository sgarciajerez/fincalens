import { describe, expect, it } from "vitest";
import {
  isIdealistaListing,
  normalizeIdealista,
  type RawCapture,
} from "../packages/portal-adapters/src/idealista.js";

const listing: RawCapture = {
  url: "https://www.idealista.com/inmueble/105052300/?utm_source=demo",
  title: "Piso luminoso en Madrid",
  location: "Chamberí, Madrid",
  price: "269.000 €",
  previousPrice: "279.000 €",
  features: ["86 m² construidos", "3 hab.", "2 baños"],
  description: "Descripción pública del anuncio.",
};

describe("adaptador público de Idealista", () => {
  it("limita la captura a URLs canónicas de anuncios y normaliza los campos", () => {
    expect(isIdealistaListing(listing.url)).toBe(true);
    expect(
      isIdealistaListing("https://www.idealista.com/venta-viviendas/madrid/"),
    ).toBe(false);
    const snapshot = normalizeIdealista(listing, "2026-10-30T12:00:00.000Z");
    expect(snapshot).toMatchObject({
      url: "https://www.idealista.com/inmueble/105052300/",
      listingId: "105052300",
      price: 269000,
      previousAdvertisedPrice: 279000,
      area: 86,
      bedrooms: 3,
      bathrooms: 2,
      rent: null,
      source: "listing",
    });
  });

  it("rechaza anuncios fuera del dominio y precios ilegibles", () => {
    expect(() =>
      normalizeIdealista({
        ...listing,
        url: "https://example.org/inmueble/105052300/",
      }),
    ).toThrow(/Idealista/);
    expect(() =>
      normalizeIdealista({ ...listing, price: "Consultar" }),
    ).toThrow(/precio/);
  });
});
