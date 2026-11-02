import { LitElement, html, nothing } from "lit";
import { ElementController } from "@open-cells/element-controller";
import type { Scenario } from "@fincalens/contracts";

export class ScenarioEditor extends LitElement {
  static properties = {
    value: { attribute: false },
    restricted: { type: Boolean },
  };
  static get outbounds() {
    return { publishedScenario: { channel: "fincalens:scenario-change" } };
  }
  declare value: Scenario;
  declare restricted: boolean;
  declare publishedScenario: Scenario;
  private controller: ElementController;

  constructor() {
    super();
    this.value = {
      price: 180000,
      rent: null,
      finance: 80,
      interest: 3.2,
      years: 30,
      renovation: 0,
      expensePercent: 15,
      taxPercent: 6,
      agencyCosts: 350,
      valuationCosts: 400,
      hypotheticalFinancing: false,
    };
    this.restricted = false;
    this.controller = new ElementController(this);
  }

  private change(key: keyof Scenario, raw: string | boolean) {
    const next = {
      ...this.value,
      [key]:
        key === "hypotheticalFinancing"
          ? raw
          : key === "rent" && raw === ""
            ? null
            : Number(raw),
    } as Scenario;
    this.value = next;
    this.publishedScenario = next;
    this.dispatchEvent(
      new CustomEvent("scenario-change", {
        detail: next,
        bubbles: true,
        composed: true,
      }),
    );
  }

  createRenderRoot() {
    return this;
  }
  render() {
    const numeric = (
      label: string,
      key: keyof Scenario,
      min = 0,
      step = 1,
      suffix = "",
    ) =>
      html`<label
        >${label}<span style="position:relative"
          ><input
            type="number"
            min=${min}
            step=${step}
            .value=${this.value[key] == null ? "" : String(this.value[key])}
            @input=${(event: Event) =>
              this.change(key, (event.target as HTMLInputElement).value)}
          />${suffix ? html`<small>${suffix}</small>` : nothing}</span
        ></label
      >`;
    return html`<section class="scenario-editor panel">
      <h3>Simula tu escenario</h3>
      <div class="scenario-grid">
        ${numeric("Precio de compra", "price", 1000, 1000, "€")}
        ${numeric("Alquiler mensual estimado", "rent", 0, 25, "€")}
        ${numeric("Financiación", "finance", 0, 5, "%")}
        ${numeric("Tipo de interés", "interest", 0, 0.1, "%")}
        ${numeric("Plazo hipotecario", "years", 1, 1, "años")}
        ${numeric("Reforma", "renovation", 0, 500, "€")}
        ${numeric(
          "Gastos operativos",
          "expensePercent",
          0,
          1,
          "% del alquiler",
        )}
        ${numeric("Impuesto de compra supuesto", "taxPercent", 0, 0.5, "%")}
        ${this.restricted
          ? html`<label class="form-note"
              ><span
                ><input
                  type="checkbox"
                  .checked=${this.value.hypotheticalFinancing}
                  @change=${(event: Event) =>
                    this.change(
                      "hypotheticalFinancing",
                      (event.target as HTMLInputElement).checked,
                    )}
                />
                Permitir financiación hipotética para explorar números</span
              ></label
            >`
          : nothing}
      </div>
      <p class="form-note" style="margin-top:12px">
        La estimación de alquiler es un supuesto que introduces tú. FincaLens no
        consulta una fuente de mercado.
      </p>
    </section>`;
  }
}
customElements.define("fl-scenario-editor", ScenarioEditor);
