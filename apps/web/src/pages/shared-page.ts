import { html } from "lit";
import { FincaPage } from "../page.js";
import { api, euro, pct } from "../api.js";
import type { ReportRevision } from "@fincalens/contracts";

export class SharedPage extends FincaPage {
  static properties = { report: { state: true }, error: { state: true } };
  declare report: ReportRevision | null;
  declare error: string;
  constructor() {
    super();
    this.report = null;
    this.error = "";
  }
  protected async load() {
    const token = location.hash.split("/").at(-1);
    try {
      this.report = await api<ReportRevision>(
        `/v1/shared/${encodeURIComponent(token || "")}`,
      );
    } catch (e) {
      this.error = this.message(e);
    }
  }
  render() {
    if (this.error)
      return html`<div class="empty-state">
        <h1>Informe no disponible</h1>
        <p>${this.error}</p>
      </div>`;
    if (!this.report)
      return html`<div class="loading">Cargando informe compartido…</div>`;
    const r = this.report;
    return html`<header class="page-head">
        <div>
          <div class="eyebrow">INFORME COMPARTIDO · SOLO LECTURA</div>
          <h1>${r.snapshot.title}</h1>
          <p class="subtitle">
            ${r.snapshot.location} · ${euro(r.snapshot.price)}
          </p>
        </div>
      </header>
      <section class="verdict">
        <div class="eyebrow">ANÁLISIS ORIENTATIVO</div>
        <h2>
          ${r.result.decision === "restricted"
            ? "Requiere comprobación"
            : r.result.decision === "caution"
              ? "Flujo negativo"
              : r.result.decision === "incomplete"
                ? "Faltan datos"
                : "Escenario financiero"}
        </h2>
        <p>${r.summary}</p>
        <div class="verdict-metrics">
          <div>
            <small>Alquiler supuesto</small
            ><strong>${euro(r.scenario.rent)}</strong>
          </div>
          <div>
            <small>Flujo mensual</small
            ><strong>${euro(r.result.cashFlow)}</strong>
          </div>
          <div>
            <small>Rentabilidad neta</small
            ><strong>${pct(r.result.netYield)}</strong>
          </div>
        </div>
      </section>
      <section class="panel report-section">
        <h2>Supuestos y limitaciones</h2>
        <p class="form-note" style="margin-top:10px">
          Financiación ${r.scenario.finance} %, interés
          ${pct(r.scenario.interest)}, plazo ${r.scenario.years} años, gastos
          operativos ${r.scenario.expensePercent} % del alquiler. Los datos se
          deben verificar de forma independiente.
        </p>
        ${r.result.warnings.map(
          (w) => html`<p class="banner-note" style="margin-top:10px">${w}</p>`,
        )}
      </section>
      ${r.risks.length
        ? html`<section class="panel report-section">
            <h2>Alertas del anuncio</h2>
            ${r.risks.map(
              (risk) =>
                html`<div class="risk-row">
                  <strong>${risk.title}</strong>
                  <p>${risk.evidence}</p>
                </div>`,
            )}
          </section>`
        : ""}
      <p class="form-note" style="margin-top:18px">
        Enlace temporal de solo lectura. FincaLens no verifica la información ni
        ofrece asesoramiento financiero.
      </p>`;
  }
}
customElements.define("shared-page", SharedPage);
