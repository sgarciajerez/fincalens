import { html } from "lit";
import { FincaPage } from "../page.js";
import { api, euro, pct } from "../api.js";
import type { PropertySummary } from "@fincalens/contracts";

export class ComparePage extends FincaPage {
  static properties = {
    properties: { state: true },
    selected: { state: true },
    error: { state: true },
  };
  declare properties: PropertySummary[];
  declare selected: string[];
  declare error: string;
  constructor() {
    super();
    this.properties = [];
    this.selected = [];
    this.error = "";
  }
  protected async load() {
    try {
      this.properties = await api<PropertySummary[]>("/v1/properties");
      this.selected = this.properties.slice(0, 3).map((p) => p.id);
      this.error = "";
    } catch (e) {
      this.error = this.message(e);
    }
  }
  private toggle(id: string) {
    this.selected = this.selected.includes(id)
      ? this.selected.filter((x) => x !== id)
      : this.selected.length < 3
        ? [...this.selected, id]
        : this.selected;
  }
  render() {
    const rows = this.properties.filter((p) => this.selected.includes(p.id));
    return html`<header class="page-head">
        <div>
          <div class="eyebrow">DECISIÓN CON CONTEXTO</div>
          <h1>Comparar inmuebles</h1>
          <p class="subtitle">
            Contrasta precio, rentabilidad y flujo mensual de hasta tres fichas.
          </p>
        </div>
        <a class="btn btn-primary" href="#!/analizar">＋ Analizar otro</a>
      </header>
      ${this.error
        ? html`<div role="alert" class="banner-note">${this.error}</div>`
        : ""}
      <section class="panel">
        <h2>Elige hasta tres inmuebles</h2>
        <div class="tabs" style="flex-wrap:wrap;margin:16px 0">
          ${this.properties.map(
            (p) =>
              html`<label
                class="tab ${this.selected.includes(p.id) ? "active" : ""}"
                ><input
                  type="checkbox"
                  .checked=${this.selected.includes(p.id)}
                  @change=${() => this.toggle(p.id)}
                />${p.title}</label
              >`,
          )}
        </div>
        ${rows.length
          ? html`<div style="overflow:auto">
                <table class="comparison-table">
                  <thead>
                    <tr>
                      <th>Indicador</th>
                      ${rows.map(
                        (p) =>
                          html`<th>
                            <a
                              class="subtle-link"
                              href=${`#!/informe/${p.reportId}`}
                              >${p.title}</a
                            >
                          </th>`,
                      )}
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td>Zona</td>
                      ${rows.map((p) => html`<td>${p.location}</td>`)}
                    </tr>
                    <tr>
                      <td>Precio</td>
                      ${rows.map((p) => html`<td>${euro(p.price)}</td>`)}
                    </tr>
                    <tr>
                      <td>Superficie</td>
                      ${rows.map(
                        (p) => html`<td>${p.area ? `${p.area} m²` : "—"}</td>`,
                      )}
                    </tr>
                    <tr>
                      <td>Alquiler aportado</td>
                      ${rows.map((p) => html`<td>${euro(p.rent)}</td>`)}
                    </tr>
                    <tr>
                      <td>Rentabilidad neta</td>
                      ${rows.map((p) => html`<td>${pct(p.netYield)}</td>`)}
                    </tr>
                    <tr>
                      <td>Flujo mensual</td>
                      ${rows.map((p) => html`<td>${euro(p.cashFlow)}</td>`)}
                    </tr>
                    <tr>
                      <td>Puntuación financiera</td>
                      ${rows.map(
                        (p) =>
                          html`<td>
                            ${p.score === null ? "—" : `${p.score}/100`}
                          </td>`,
                      )}
                    </tr>
                  </tbody>
                </table>
              </div>
              <p class="form-note" style="margin-top:14px">
                Las comparaciones solo son útiles si los supuestos son
                comparables. Abre cada informe para ajustar renta, reforma y
                financiación.
              </p>`
          : html`<div class="empty-state">
              <h2>Necesitas un informe para comparar</h2>
              <p>
                Analiza un anuncio o carga ejemplos de demostración desde la
                cartera.
              </p>
              <a class="btn btn-primary" href="#!/">Ir a mi cartera</a>
            </div>`}
      </section>`;
  }
}
customElements.define("compare-page", ComparePage);
