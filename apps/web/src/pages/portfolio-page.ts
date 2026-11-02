import { html } from "lit";
import { api, euro, pct, notify } from "../api.js";
import { FincaPage } from "../page.js";
import type { PropertySummary } from "@fincalens/contracts";

export class PortfolioPage extends FincaPage {
  static properties = {
    properties: { state: true },
    filter: { state: true },
    query: { state: true },
    busy: { state: true },
    error: { state: true },
  };
  declare properties: PropertySummary[];
  declare filter: string;
  declare query: string;
  declare busy: boolean;
  declare error: string;
  constructor() {
    super();
    this.properties = [];
    this.filter = "all";
    this.query = "";
    this.busy = false;
    this.error = "";
  }
  protected async load() {
    try {
      this.properties = await api<PropertySummary[]>("/v1/properties");
      this.error = "";
    } catch (e) {
      this.error = this.message(e);
    }
  }
  private async examples() {
    this.busy = true;
    try {
      await api("/v1/examples", { method: "POST", body: "{}" });
      for (let i = 0; i < 30; i++) {
        await new Promise((r) => setTimeout(r, 200));
        await this.load();
        if (this.properties.length >= 4) break;
      }
      notify("Se han añadido los ejemplos sintéticos.");
    } catch (e) {
      this.error = this.message(e);
    } finally {
      this.busy = false;
    }
  }
  private async favorite(p: PropertySummary) {
    try {
      await api(`/v1/properties/${p.id}`, {
        method: "PATCH",
        body: JSON.stringify({ favorite: !p.favorite }),
      });
      await this.load();
    } catch (e) {
      notify(this.message(e));
    }
  }
  private exportCsv() {
    const rows = [
      [
        "Inmueble",
        "Ubicación",
        "Precio",
        "Superficie m²",
        "Alquiler supuesto",
        "Rentabilidad neta %",
        "Flujo mensual",
        "Puntuación",
        "Fecha de actualización",
      ],
      ...this.properties.map((p) => [
        p.title,
        p.location,
        p.price,
        p.area ?? "",
        p.rent ?? "",
        p.netYield ?? "",
        p.cashFlow ?? "",
        p.score ?? "",
        p.updatedAt,
      ]),
    ];
    const csv =
      "\uFEFF" +
      rows
        .map((row) =>
          row
            .map((value) => `"${String(value).replaceAll('"', '""')}"`)
            .join(";"),
        )
        .join("\r\n");
    const url = URL.createObjectURL(
      new Blob([csv], { type: "text/csv;charset=utf-8" }),
    );
    const link = document.createElement("a");
    link.href = url;
    link.download = "fincalens-cartera.csv";
    link.click();
    URL.revokeObjectURL(url);
  }
  private get visible() {
    return this.properties.filter(
      (p) =>
        (this.filter === "all" ||
          (this.filter === "favorite" && p.favorite) ||
          (this.filter === "opportunity" &&
            p.score !== null &&
            p.score >= 70) ||
          (this.filter === "review" && (p.score === null || p.score < 70))) &&
        `${p.title} ${p.location}`
          .toLowerCase()
          .includes(this.query.toLowerCase()),
    );
  }
  render() {
    const avg = this.properties
      .map((p) => p.netYield)
      .filter((x): x is number => x !== null);
    return html`<header class="page-head">
        <div>
          <div class="eyebrow">TU PRÓXIMA INVERSIÓN EMPIEZA AQUÍ</div>
          <h1>Mi cartera</h1>
          <p class="subtitle">
            Una perspectiva clara de tus oportunidades inmobiliarias.
          </p>
        </div>
        <div class="head-actions">
          <button
            class="btn"
            ?disabled=${!this.properties.length}
            @click=${() => this.exportCsv()}
          >
            Exportar CSV</button
          ><a class="btn" href="#!/comparar">Comparar inmuebles</a
          ><a class="btn btn-primary" href="#!/analizar"
            >＋ Analizar inmueble</a
          >
        </div>
      </header>
      <section class="stats-grid" aria-label="Resumen de cartera">
        <article class="stat">
          <div class="stat-label">Inmuebles analizados</div>
          <div class="stat-value mono">${this.properties.length}</div>
          <p class="stat-bottom">Informes guardados en este espacio</p>
        </article>
        <article class="stat">
          <div class="stat-label">Rentabilidad neta media</div>
          <div class="stat-value mono">
            ${pct(
              avg.length ? avg.reduce((a, b) => a + b, 0) / avg.length : null,
            )}
          </div>
          <p class="stat-bottom">
            Antes de financiación e impuestos personales
          </p>
        </article>
        <article class="stat">
          <div class="stat-label">Oportunidades destacadas</div>
          <div class="stat-value mono">
            ${this.properties.filter((p) => p.score !== null && p.score >= 70)
              .length}
          </div>
          <p class="stat-bottom">Puntuación financiera orientativa</p>
        </article>
        <article class="stat">
          <div class="stat-label">Historial de precios</div>
          <div class="stat-value mono">
            ${this.properties.reduce((n, p) => n + p.observations.length, 0)}
          </div>
          <p class="stat-bottom">Observaciones capturadas por FincaLens</p>
        </article>
      </section>
      ${this.error
        ? html`<div class="banner-note" role="alert">
            ${this.error}
            <button class="inline-button" @click=${() => this.load()}>
              Reintentar
            </button>
          </div>`
        : ""}
      <section>
        <div class="section-heading">
          <h2>
            Tus inmuebles <span class="count">${this.properties.length}</span>
          </h2>
          <button
            class="btn btn-sm"
            ?disabled=${this.busy}
            @click=${() => this.examples()}
          >
            ${this.busy ? "Cargando…" : "Cargar ejemplos"}
          </button>
        </div>
        <div class="toolbar">
          <div class="tabs" role="group" aria-label="Filtrar inmuebles">
            ${[
              ["all", "Todos"],
              ["opportunity", "Oportunidades"],
              ["review", "A revisar"],
              ["favorite", "Favoritos"],
            ].map(
              ([key, label]) =>
                html`<button
                  class="tab ${this.filter === key ? "active" : ""}"
                  aria-pressed=${this.filter === key}
                  @click=${() => (this.filter = key)}
                >
                  ${label}
                </button>`,
            )}
          </div>
          <label class="search"
            ><span class="sr-only">Buscar inmueble o zona</span
            ><input
              placeholder="Buscar inmueble o zona…"
              type="search"
              .value=${this.query}
              @input=${(e: Event) =>
                (this.query = (e.target as HTMLInputElement).value)}
          /></label>
        </div>
        ${this.visible.length
          ? html`<div class="property-grid">
              ${this.visible.map(
                (property) =>
                  html`<fl-property-card
                    .property=${property}
                    @favorite-toggle=${(e: CustomEvent<PropertySummary>) =>
                      this.favorite(e.detail)}
                  ></fl-property-card>`,
              )}
            </div>`
          : html`<div class="empty-state">
              <span class="icon">⌂</span>
              <h2>
                ${this.properties.length
                  ? "No hay resultados con este filtro"
                  : "Tu cartera está lista para empezar"}
              </h2>
              <p>
                ${this.properties.length
                  ? "Prueba otra búsqueda o filtro."
                  : "Analiza un anuncio de Idealista con la extensión, introduce un inmueble manualmente o carga los ejemplos sintéticos para explorar el producto."}
              </p>
              ${!this.properties.length
                ? html`<a class="btn btn-primary" href="#!/analizar"
                      >Analizar inmueble</a
                    >
                    <button
                      class="btn"
                      ?disabled=${this.busy}
                      @click=${() => this.examples()}
                    >
                      ${this.busy ? "Cargando…" : "Explorar con ejemplos"}
                    </button>`
                : ""}
            </div>`}
      </section>`;
  }
}
customElements.define("portfolio-page", PortfolioPage);
