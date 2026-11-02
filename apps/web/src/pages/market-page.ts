import { html } from "lit";
import { FincaPage } from "../page.js";
import { api, notify } from "../api.js";
import type {
  MarketReferenceInput,
  MarketReferenceSnapshot,
  ComparableListingInput,
  ComparableListingSnapshot,
} from "@fincalens/contracts";

function parseCsv(text: string): Record<string, string>[] {
  const rows: string[][] = [];
  let row: string[] = [],
    field = "",
    quoted = false;
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (quoted && char === '"' && text[i + 1] === '"') {
      field += '"';
      i++;
    } else if (char === '"') quoted = !quoted;
    else if (!quoted && char === ",") {
      row.push(field.trim());
      field = "";
    } else if (!quoted && (char === "\n" || char === "\r")) {
      if (char === "\r" && text[i + 1] === "\n") i++;
      row.push(field.trim());
      if (row.some(Boolean)) rows.push(row);
      row = [];
      field = "";
    } else field += char;
  }
  row.push(field.trim());
  if (row.some(Boolean)) rows.push(row);
  if (rows.length < 2)
    throw new Error("El CSV debe incluir una cabecera y al menos una fila.");
  const headers = rows.shift()!.map((header) => header.replace(/^\uFEFF/, ""));
  return rows.map((values) =>
    Object.fromEntries(
      headers.map((header, index) => [header, values[index] ?? ""]),
    ),
  );
}

export class MarketPage extends FincaPage {
  static properties = {
    references: { state: true },
    error: { state: true },
    busy: { state: true },
    comparables: { state: true },
  };
  declare references: MarketReferenceSnapshot[];
  declare error: string;
  declare busy: boolean;
  declare comparables: ComparableListingSnapshot[];
  constructor() {
    super();
    this.references = [];
    this.error = "";
    this.busy = false;
    this.comparables = [];
  }
  protected async load() {
    try {
      [this.references, this.comparables] = await Promise.all([
        api<MarketReferenceSnapshot[]>("/v1/market-references"),
        api<ComparableListingSnapshot[]>("/v1/comparables"),
      ]);
      this.error = "";
    } catch (error) {
      this.error = this.message(error);
    }
  }
  private async importReferences(references: MarketReferenceInput[]) {
    this.busy = true;
    try {
      const result = await api<{ imported: number }>(
        "/v1/market-references/import",
        {
          method: "POST",
          body: JSON.stringify({ authorized: true, references }),
        },
      );
      await this.load();
      notify(`${result.imported} referencia(s) importada(s).`);
      return true;
    } catch (error) {
      this.error = this.message(error);
      return false;
    } finally {
      this.busy = false;
    }
  }
  private async submitManual(event: SubmitEvent) {
    event.preventDefault();
    const form = event.currentTarget as HTMLFormElement;
    const data = new FormData(form);
    const reference = {
      geography: String(data.get("geography")),
      level: String(data.get("level")),
      rentPerM2: Number(data.get("rentPerM2")),
      asOf: String(data.get("asOf")),
      sampleSize: data.get("sampleSize")
        ? Number(data.get("sampleSize"))
        : null,
      dispersion: data.get("dispersion")
        ? Number(data.get("dispersion"))
        : null,
      sourceLabel: String(data.get("sourceLabel")),
      usageTerms: String(data.get("usageTerms")),
    } as MarketReferenceInput;
    if (!data.get("authorized")) {
      this.error = "Confirma que tienes derecho a usar y procesar estos datos.";
      return;
    }
    if (await this.importReferences([reference])) form.reset();
  }
  private async submitCsv(event: SubmitEvent) {
    event.preventDefault();
    this.error = "";
    const form = event.currentTarget as HTMLFormElement;
    const data = new FormData(form);
    if (!data.get("authorized")) {
      this.error = "Confirma que tienes derecho a usar y procesar estos datos.";
      return;
    }
    try {
      const text = String(data.get("csv") || "");
      const rows = parseCsv(text);
      if (rows.length > 200)
        throw new Error("El límite es de 200 filas por importación.");
      const references = rows.map((row) => ({
        geography: row.geography,
        level: row.level as MarketReferenceInput["level"],
        rentPerM2: Number(row.rentPerM2),
        asOf: row.asOf,
        sampleSize: row.sampleSize ? Number(row.sampleSize) : null,
        dispersion: row.dispersion ? Number(row.dispersion) : null,
        sourceLabel: row.sourceLabel,
        usageTerms: row.usageTerms,
      }));
      if (await this.importReferences(references)) form.reset();
    } catch (error) {
      this.error = this.message(error);
    }
  }
  private async deleteReference(id: string) {
    try {
      await api(`/v1/market-references/${id}`, { method: "DELETE" });
      await this.load();
      notify("Referencia eliminada.");
    } catch (error) {
      this.error = this.message(error);
    }
  }
  private async submitComparablesCsv(event: SubmitEvent) {
    event.preventDefault();
    this.error = "";
    const form = event.currentTarget as HTMLFormElement,
      data = new FormData(form);
    if (!data.get("authorized")) {
      this.error = "Confirma que tienes derecho a usar y procesar estos datos.";
      return;
    }
    try {
      const rows = parseCsv(String(data.get("compsCsv") || ""));
      if (rows.length > 500)
        throw new Error("El límite es de 500 anuncios por importación.");
      const comparables: ComparableListingInput[] = rows.map((row) => ({
        geography: row.geography,
        propertyType:
          row.propertyType as ComparableListingInput["propertyType"],
        price: Number(row.price),
        area: Number(row.area),
        bedrooms: row.bedrooms ? Number(row.bedrooms) : null,
        observedAt: row.observedAt,
        sourceLabel: row.sourceLabel,
        usageTerms: row.usageTerms,
      }));
      this.busy = true;
      const result = await api<{ imported: number }>("/v1/comparables/import", {
        method: "POST",
        body: JSON.stringify({ authorized: true, comparables }),
      });
      form.reset();
      await this.load();
      notify(`${result.imported} anuncios comparables importados.`);
    } catch (error) {
      this.error = this.message(error);
    } finally {
      this.busy = false;
    }
  }
  private async deleteComparable(id: string) {
    try {
      await api(`/v1/comparables/${id}`, { method: "DELETE" });
      await this.load();
      notify("Comparable eliminado.");
    } catch (error) {
      this.error = this.message(error);
    }
  }
  private downloadTemplate() {
    const csv =
      'geography,level,rentPerM2,asOf,sampleSize,dispersion,sourceLabel,usageTerms\n"El Cabanyal · Valencia",neighborhood,13.5,2026-10-01,42,2.1,"Fuente licenciada","Uso autorizado para análisis interno"\n';
    const url = URL.createObjectURL(
      new Blob([csv], { type: "text/csv;charset=utf-8" }),
    );
    const link = document.createElement("a");
    link.href = url;
    link.download = "fincalens-referencias-alquiler.csv";
    link.click();
    URL.revokeObjectURL(url);
  }
  private downloadComparableTemplate() {
    const csv =
      'listingKey,geography,propertyType,price,area,bedrooms,observedAt,sourceLabel,usageTerms\nidealista:105052300,"El Cabanyal · Valencia",flat,172000,72,2,2026-10-10,"Idealista","Licencia permite análisis interno"\n';
    const url = URL.createObjectURL(
      new Blob([csv], { type: "text/csv;charset=utf-8" }),
    );
    const link = document.createElement("a");
    link.href = url;
    link.download = "fincalens-comparables.csv";
    link.click();
    URL.revokeObjectURL(url);
  }
  render() {
    return html`<header class="page-head">
        <div>
          <div class="eyebrow">DATOS APORTADOS POR TI</div>
          <h1>Referencias de alquiler</h1>
          <p class="subtitle">
            Guarda fuentes de alquiler que tengas derecho a usar. Se aplican a
            los informes solo cuando eliges una coincidencia exacta de zona.
          </p>
        </div>
      </header>
      ${this.error
        ? html`<div role="alert" class="banner-note">${this.error}</div>`
        : ""}
      <div class="market-grid">
        <section class="panel">
          <div class="panel-head">
            <div>
              <h2>Añadir una referencia</h2>
              <p class="form-note">
                Importe mensual por metro cuadrado. Conservamos fuente, fecha,
                muestra y condiciones declaradas.
              </p>
            </div>
          </div>
          <form
            class="form-grid"
            @submit=${(event: SubmitEvent) => this.submitManual(event)}
          >
            <label class="field"
              ><span>Zona exacta</span
              ><input
                name="geography"
                required
                minlength="2"
                maxlength="160"
                placeholder="El Cabanyal · Valencia"
            /></label>
            <label class="field"
              ><span>Nivel geográfico</span
              ><select name="level">
                <option value="neighborhood">Barrio</option>
                <option value="district">Distrito</option>
                <option value="municipality">Municipio</option>
                <option value="province">Provincia</option>
              </select></label
            >
            <label class="field"
              ><span>Alquiler €/m²/mes</span
              ><input
                name="rentPerM2"
                type="number"
                min="0.1"
                max="200"
                step="0.01"
                required
            /></label>
            <label class="field"
              ><span>Fecha de los datos</span
              ><input name="asOf" type="date" required
            /></label>
            <label class="field"
              ><span>Tamaño de muestra</span
              ><input
                name="sampleSize"
                type="number"
                min="1"
                max="1000000"
                placeholder="Opcional"
            /></label>
            <label class="field"
              ><span>Dispersión (%)</span
              ><input
                name="dispersion"
                type="number"
                min="0"
                max="100"
                step="0.1"
                placeholder="Opcional"
            /></label>
            <label class="field"
              ><span>Fuente / proveedor</span
              ><input
                name="sourceLabel"
                required
                minlength="2"
                maxlength="120"
                placeholder="Proveedor y conjunto de datos"
            /></label>
            <label class="field"
              ><span>Licencia o condiciones de uso</span
              ><input
                name="usageTerms"
                required
                minlength="12"
                maxlength="500"
                placeholder="Permiso, licencia y alcance"
            /></label>
            <label class="checklist-row market-consent"
              ><input name="authorized" type="checkbox" required /><span
                >Confirmo que puedo usar y procesar estos datos bajo las
                condiciones indicadas.</span
              ></label
            >
            <button class="btn btn-primary" ?disabled=${this.busy}>
              ${this.busy ? "Importando…" : "Guardar referencia"}
            </button>
          </form>
        </section>
        <section class="panel">
          <div class="panel-head">
            <div>
              <h2>Importar CSV</h2>
              <p class="form-note">
                Hasta 200 filas. Cabeceras requeridas: geography, level,
                rentPerM2, asOf, sourceLabel y usageTerms. sampleSize y
                dispersion son opcionales.
              </p>
            </div>
            <button class="btn btn-sm" @click=${this.downloadTemplate}>
              Descargar plantilla
            </button>
          </div>
          <form @submit=${(event: SubmitEvent) => this.submitCsv(event)}>
            <label class="field"
              ><span>Contenido CSV</span
              ><textarea
                name="csv"
                required
                rows="7"
                placeholder="geography,level,rentPerM2,asOf,sampleSize,dispersion,sourceLabel,usageTerms"
              ></textarea></label
            ><label class="checklist-row market-consent"
              ><input name="authorized" type="checkbox" required /><span
                >Confirmo que tengo autorización para importar y procesar todos
                los datos.</span
              ></label
            ><button class="btn" ?disabled=${this.busy}>Importar CSV</button>
          </form>
        </section>
      </div>
      <section class="panel report-section">
        <div class="panel-head">
          <div>
            <h2>Anuncios comparables</h2>
            <p class="form-note">
              Importa anuncios de venta con derechos de uso. FincaLens los
              compara por coincidencia exacta de zona, tipología, superficie ±30
              % y habitaciones próximas. Los precios son de anuncio, no de
              cierre.
            </p>
          </div>
          <button class="btn btn-sm" @click=${this.downloadComparableTemplate}>
            Descargar plantilla
          </button>
        </div>
        <form
          @submit=${(event: SubmitEvent) => this.submitComparablesCsv(event)}
        >
          <label class="field"
            ><span>CSV de anuncios comparables</span
            ><textarea
              name="compsCsv"
              required
              rows="6"
              placeholder="geography,propertyType,price,area,bedrooms,observedAt,sourceLabel,usageTerms"
            ></textarea></label
          ><label class="checklist-row market-consent"
            ><input name="authorized" type="checkbox" required /><span
              >Confirmo que puedo importar y procesar los anuncios y que su uso
              permite este análisis.</span
            ></label
          ><button class="btn" ?disabled=${this.busy}>
            ${this.busy ? "Importando…" : "Importar comparables"}
          </button>
        </form>
        <div class="market-list">
          ${this.comparables.map(
            (item) =>
              html`<article class="market-row">
                <div>
                  <strong>${item.geography}</strong
                  ><span class="chip">${item.propertyType}</span>
                  <p>
                    ${item.price.toLocaleString("es-ES")} € · ${item.area} m² ·
                    ${item.bedrooms === null
                      ? "habitaciones desconocidas"
                      : `${item.bedrooms} hab.`}
                    · ${item.observedAt}
                  </p>
                  <p class="form-note">
                    ${item.sourceLabel} · ${item.usageTerms}
                  </p>
                </div>
                <button
                  class="btn btn-sm"
                  @click=${() => this.deleteComparable(item.id)}
                >
                  Eliminar
                </button>
              </article>`,
          )}
        </div>
      </section>
      <section class="panel report-section">
        <div class="panel-head">
          <div>
            <h2>Referencias guardadas</h2>
            <p class="form-note">
              Estas referencias solo alimentan escenarios cuando las seleccionas
              expresamente en un informe.
            </p>
          </div>
          <span class="chip">${this.references.length} registros</span>
        </div>
        ${this.references.length
          ? html`<div class="market-list">
              ${this.references.map(
                (reference) =>
                  html`<article class="market-row">
                    <div>
                      <strong>${reference.geography}</strong
                      ><span class="chip">${reference.level}</span>
                      <p>
                        ${reference.rentPerM2.toLocaleString("es-ES")} €/m²/mes
                        · datos
                        ${reference.asOf}${reference.sampleSize
                          ? ` · n=${reference.sampleSize}`
                          : ""}${reference.dispersion !== null
                          ? ` · dispersión ${reference.dispersion}%`
                          : ""}
                      </p>
                      <p class="form-note">
                        ${reference.sourceLabel} · Importado
                        ${new Date(reference.importedAt).toLocaleDateString(
                          "es-ES",
                        )}
                      </p>
                      <p class="form-note">${reference.usageTerms}</p>
                    </div>
                    <button
                      class="btn btn-sm"
                      @click=${() => this.deleteReference(reference.id)}
                    >
                      Eliminar
                    </button>
                  </article>`,
              )}
            </div>`
          : html`<div class="empty-state">
              <h2>Aún no hay referencias</h2>
              <p>Añade manualmente una fuente autorizada o importa tu CSV.</p>
            </div>`}
      </section>`;
  }
}
customElements.define("market-page", MarketPage);
