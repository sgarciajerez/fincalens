import { snapshotSchema, type ListingSnapshot } from "@fincalens/contracts";
export const examples: ListingSnapshot[] = [
  {
    title: "Piso en Calle del Mar",
    location: "El Cabanyal · Valencia",
    price: 185000,
    area: 72,
    bedrooms: 2,
    bathrooms: 1,
    rent: 1100,
    description:
      "Ejemplo sintético. Vivienda de dos dormitorios sin restricciones declaradas.",
  },
  {
    title: "Piso en Calle de Olavide",
    location: "Ruzafa · Valencia",
    price: 269000,
    area: 86,
    bedrooms: 3,
    bathrooms: 2,
    rent: 1300,
    description: "Ejemplo sintético para comparar costes de adquisición.",
  },
  {
    title: "Piso en Plaza de los Naranjos",
    location: "Benimaclet · Valencia",
    price: 149000,
    area: 65,
    bedrooms: 2,
    bathrooms: 1,
    rent: 950,
    description: "Ejemplo sintético de escenario con margen positivo.",
  },
  {
    title: "Vivienda con condiciones de transmisión",
    location: "Jerez · ejemplo de riesgo",
    price: 32000,
    area: 74,
    bedrooms: 3,
    bathrooms: 1,
    rent: null,
    description:
      "Ejemplo sintético. Vivienda de Protección Oficial. Se transmite arrendada a tercero. No podría ser hipotecado mientras persista la situación descrita. Orden ECO/805/2003. Sin ascensor.",
  },
].map((s, index) =>
  snapshotSchema.parse({
    ...s,
    portal: "example",
    listingId: `example-${index}`,
    url: null,
    capturedAt: "2026-10-30T10:00:00.000Z",
    source: "example",
    rentSource: s.rent === null ? "unknown" : "example",
  }),
);
