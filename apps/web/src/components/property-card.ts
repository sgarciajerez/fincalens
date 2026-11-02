import { LitElement, html } from "lit";
import type { PropertySummary } from "@fincalens/contracts";
import { euro, pct } from "../api.js";

export class PropertyCard extends LitElement {
  static properties = { property: { attribute: false } };
  declare property: PropertySummary;
  constructor() {
    super();
    this.property = {} as PropertySummary;
  }
  createRenderRoot() {
    return this;
  }
  render() {
    const p = this.property;
    return html`<article class="property-card">
      <div class="property-image">
        <span class="placeholder-house" aria-hidden="true">⌂</span
        ><span class="image-badge"
          >${p.source === "example" ? "EJEMPLO" : "ANÁLISIS"}</span
        >
      </div>
      <div class="property-body">
        <a href="#!/informe/${p.reportId}"><h3>${p.title}</h3></a>
        <div class="property-meta">
          ${p.location} · ${p.area ? `${p.area} m²` : "superficie sin informar"}
        </div>
        <div class="property-numbers">
          <div><small>Precio</small><strong>${euro(p.price)}</strong></div>
          <div>
            <small>Rentabilidad neta</small><strong>${pct(p.netYield)}</strong>
          </div>
          <div>
            <small>Flujo mensual</small><strong>${euro(p.cashFlow)}</strong>
          </div>
        </div>
        <div class="card-actions">
          <span
            class="chip ${p.score === null
              ? ""
              : p.score >= 70
                ? "chip-good"
                : "chip-warn"}"
            >${p.score === null
              ? "Falta alquiler"
              : `${p.score}/100 orientativo`}</span
          ><button
            class="inline-button"
            @click=${() =>
              this.dispatchEvent(
                new CustomEvent("favorite-toggle", {
                  detail: p,
                  bubbles: true,
                  composed: true,
                }),
              )}
            aria-label=${p.favorite
              ? "Quitar de favoritos"
              : "Añadir a favoritos"}
          >
            ${p.favorite ? "♥ Guardado" : "♡ Guardar"}
          </button>
        </div>
      </div>
    </article>`;
  }
}
customElements.define("fl-property-card", PropertyCard);
