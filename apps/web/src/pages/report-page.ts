import { html } from "lit";
import { FincaPage } from "../page.js";
import { api, euro, pct, notify } from "../api.js";
import type {
  MarketReferenceSnapshot,
  ReportRevision,
  Scenario,
} from "@fincalens/contracts";
import type { PropertySummary } from "@fincalens/contracts";
import { calculate, preset } from "@fincalens/domain";
import "../components/scenario-editor.js";

export class ReportPage extends FincaPage {
  static properties = {
    report: { state: true },
    error: { state: true },
    scenario: { state: true },
    checks: { state: true },
    busy: { state: true },
    shareUrl: { state: true },
    propertyNotes: { state: true },
    observations: { state: true },
    marketReferences: { state: true },
    selectedMarketReference: { state: true },
  };
  declare report: ReportRevision | null;
  declare error: string;
  declare scenario: Scenario | null;
  declare checks: Record<string, boolean>;
  declare busy: boolean;
  declare shareUrl: string;
  declare propertyNotes: string;
  declare observations: PropertySummary["observations"];
  declare marketReferences: MarketReferenceSnapshot[];
  declare selectedMarketReference: string;
  constructor() {
    super();
    this.report = null;
    this.error = "";
    this.scenario = null;
    this.checks = {};
    this.busy = false;
    this.shareUrl = "";
    this.propertyNotes = "";
    this.observations = [];
    this.marketReferences = [];
    this.selectedMarketReference = "";
  }
  private get reportIdFromHash() {
    return location.hash.split("/").at(-1) || "";
  }
  protected async load() {
    try {
      this.report = await api<ReportRevision>(
        `/v1/reports/${encodeURIComponent(this.reportIdFromHash)}`,
      );
      this.scenario = { ...this.report.scenario };
      const [checks, properties, marketReferences] = await Promise.all([
        api<Record<string, boolean>>(
          `/v1/checklists/${this.report.propertyId}`,
        ),
        api<PropertySummary[]>("/v1/properties"),
        api<MarketReferenceSnapshot[]>("/v1/market-references"),
      ]);
      this.checks = checks;
      const property = properties.find(
        (item) => item.id === this.report?.propertyId,
      );
      this.propertyNotes = property?.notes || "";
      this.observations = property?.observations || [];
      this.marketReferences = marketReferences;
      this.selectedMarketReference = "";
      this.shareUrl = "";
      this.error = "";
    } catch (e) {
      this.error = this.message(e);
    }
  }
  private async recalculate() {
    if (!this.report || !this.scenario) return;
    this.busy = true;
    try {
      const revision = await api<ReportRevision>(
        `/v1/reports/${this.report.id}/scenarios`,
        {
          method: "POST",
          body: JSON.stringify(
            this.selectedMarketReference
              ? {
                  scenario: this.scenario,
                  marketReferenceId: this.selectedMarketReference,
                }
              : this.scenario,
          ),
        },
      );
      location.hash = `#!/informe/${revision.id}`;
    } catch (e) {
      this.error = this.message(e);
    } finally {
      this.busy = false;
    }
  }
  private async preset(mode: "base" | "optimistic" | "conservative") {
    if (!this.report) return;
    this.scenario = preset(this.report.scenario, mode);
    this.selectedMarketReference = "";
  }
  private async compareMarket() {
    if (!this.report || this.busy) return;
    this.busy = true;
    this.error = "";
    try {
      const revision = await api<ReportRevision>(
        `/v1/reports/${this.report.id}/market-analysis`,
        {
          method: "POST",
          body: JSON.stringify(this.scenario ?? this.report.scenario),
        },
      );
      location.hash = `#!/informe/${revision.id}`;
    } catch (error) {
      this.error = this.message(error);
    } finally {
      this.busy = false;
    }
  }
  private useMarketReference(reference: MarketReferenceSnapshot) {
    if (!this.report || !this.scenario || !this.report.snapshot.area) return;
    this.selectedMarketReference = reference.id;
    this.scenario = {
      ...this.scenario,
      rent: Math.round(this.report.snapshot.area * reference.rentPerM2),
    };
    notify(
      "Supuesto de renta calculado. Se guardará la referencia y su procedencia en la nueva revisión.",
    );
  }
  private normalizeGeography(value: string) {
    return value
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]/g, "");
  }
  private async checklist(id: string, checked: boolean) {
    if (!this.report) return;
    const next = { ...this.checks, [id]: checked };
    this.checks = next;
    try {
      await api(`/v1/checklists/${this.report.propertyId}`, {
        method: "PATCH",
        body: JSON.stringify(next),
      });
    } catch (e) {
      this.error = this.message(e);
    }
  }
  private async saveNotes() {
    if (!this.report) return;
    try {
      await api(`/v1/properties/${this.report.propertyId}`, {
        method: "PATCH",
        body: JSON.stringify({ notes: this.propertyNotes }),
      });
      notify("Notas guardadas en la ficha del inmueble.");
    } catch (e) {
      this.error = this.message(e);
    }
  }
  private async share() {
    if (!this.report) return;
    try {
      const result = await api<{ url: string }>(
        `/v1/reports/${this.report.id}/shares`,
        { method: "POST", body: "{}" },
      );
      this.shareUrl = result.url;
      try {
        await navigator.clipboard.writeText(result.url);
        notify("Enlace copiado. Es de solo lectura y caduca en siete días.");
      } catch {
        notify(
          "Enlace creado. Cópialo desde el campo que aparece en el informe.",
        );
      }
    } catch (e) {
      this.error = this.message(e);
    }
  }
  render() {
    if (this.error && !this.report)
      return html`<div class="empty-state">
        <h1>No se pudo abrir el informe</h1>
        <p>${this.error}</p>
        <a href="#!/">Volver a mi cartera</a>
      </div>`;
    if (!this.report)
      return html`<div class="loading" role="status">Cargando informe…</div>`;
    const r = this.report;
    const scenario = this.scenario ?? r.scenario;
    const scenarioDirty =
      JSON.stringify(scenario) !== JSON.stringify(r.scenario);
    let preview = r.result;
    let previewValid = true;
    try {
      preview = calculate(scenario, r.snapshot, r.risks);
    } catch {
      previewValid = false;
    }
    const status = previewValid ? preview.decision : "restricted";
    const statusLabel =
      status === "restricted"
        ? "Requiere comprobación"
        : status === "incomplete"
          ? "Faltan datos"
          : status === "caution"
            ? "Flujo negativo"
            : status === "interesting"
              ? "Escenario favorable"
              : "Revisión necesaria";
    return html`<header class="page-head report-head">
        <div>
          <a class="back-link" href="#!/">← Mi cartera</a>
          <div class="eyebrow">
            INFORME ·
            ${r.snapshot.source === "example"
              ? "EJEMPLO SINTÉTICO"
              : "DATOS APORTADOS"}
          </div>
          <h1 class="report-title">${r.snapshot.title}</h1>
          <div class="report-info">
            <span>${r.snapshot.location}</span
            ><span>${r.snapshot.area ? `${r.snapshot.area} m²` : ""}</span
            ><span
              >Actualizado
              ${new Date(r.createdAt).toLocaleDateString("es-ES")}</span
            >
          </div>
        </div>
        <div class="head-actions">
          <button class="btn" @click=${() => window.print()}>
            Imprimir / PDF</button
          ><button class="btn btn-primary" @click=${() => this.share()}>
            Compartir enlace
          </button>
        </div>
      </header>
      ${this.error
        ? html`<p role="alert" class="banner-note">${this.error}</p>`
        : ""}${this.shareUrl
        ? html`<div class="banner-note" style="margin-bottom:16px">
            <strong>Enlace de solo lectura · caduca en siete días</strong>
            <div style="display:flex;gap:8px;margin-top:8px">
              <input
                aria-label="Enlace compartido"
                readonly
                .value=${this.shareUrl}
                style="flex:1;min-width:0;border:1px solid var(--line);border-radius:7px;padding:8px"
              /><button
                class="btn btn-sm"
                @click=${async () => {
                  try {
                    await navigator.clipboard.writeText(this.shareUrl);
                    notify("Enlace copiado.");
                  } catch {
                    notify("Selecciona y copia el enlace.");
                  }
                }}
              >
                Copiar
              </button>
            </div>
          </div>`
        : ""}
      <div class="report-layout">
        <div class="report-main">
          <section class="verdict">
            <div class="verdict-top">
              <div>
                <div class="eyebrow">
                  LECTURA DEL ESCENARIO · NO ES ASESORAMIENTO
                </div>
                <h2>${statusLabel}${scenarioDirty ? " · vista previa" : ""}</h2>
                <p>
                  ${!previewValid
                    ? "Este escenario no se puede calcular con los datos actuales. Revisa los campos o las restricciones de financiación."
                    : scenarioDirty
                      ? "Lectura calculada con los supuestos editados. Guarda el escenario para crear una revisión permanente."
                      : r.summary}
                </p>
              </div>
              <div class="score-ring">
                <svg viewBox="0 0 100 100">
                  <circle class="track" cx="50" cy="50" r="44"></circle>
                  <circle
                    class="progress"
                    cx="50"
                    cy="50"
                    r="44"
                    style=${`stroke-dasharray:276.46;stroke-dashoffset:${r.result.score === null ? 276.46 : 276.46 * (1 - r.result.score / 100)}`}
                  ></circle>
                </svg>
                <div class="score-center">
                  <strong>${r.result.score ?? "—"}</strong
                  ><small>score base</small>
                </div>
              </div>
            </div>
            <div class="verdict-metrics">
              <div>
                <small>Flujo mensual</small
                ><strong
                  class=${previewValid && (preview.cashFlow ?? 0) >= 0
                    ? "positive"
                    : ""}
                  >${previewValid ? euro(preview.cashFlow) : "—"}</strong
                >
              </div>
              <div>
                <small>Rentabilidad neta</small
                ><strong>${previewValid ? pct(preview.netYield) : "—"}</strong>
              </div>
              <div>
                <small>Capital inicial</small
                ><strong>${previewValid ? euro(preview.capital) : "—"}</strong>
              </div>
            </div>
            <div class="report-disclaimer">
              Puntuación limitada a los factores financieros documentados.
              Supuestos modificables y datos de terceros pendientes de
              verificar.
            </div>
          </section>
          <section class="panel report-section market-analysis-card">
            <div class="panel-head">
              <div>
                <div class="eyebrow">COMPARABLES DE VENTA</div>
                <h2>Precio frente al mercado</h2>
                <p class="form-note">
                  La comparación usa anuncios autorizados guardados en tu
                  cartera y anuncios importados con CSV. No consulta Idealista
                  automáticamente.
                </p>
              </div>
              ${html`<button
                class="btn btn-primary"
                ?disabled=${this.busy || !r.snapshot.area}
                @click=${() => this.compareMarket()}
              >
                ${this.busy
                  ? "Comparando…"
                  : r.marketAnalysis
                    ? "Actualizar comparables"
                    : "Buscar comparables"}
              </button>`}
            </div>
            ${r.marketAnalysis
              ? (() => {
                  const analysis = r.marketAnalysis;
                  const verdictLabels = {
                    "insufficient-data": "Faltan comparables",
                    potential: "Posible oportunidad · verificar",
                    review: "Revisión necesaria",
                    "within-range": "Dentro del rango",
                    "above-range": "Por encima del rango",
                  } as const;
                  return html`<div class="market-assessment">
                    ${scenarioDirty
                      ? html`<p class="banner-note">
                          Esta comparación pertenece a la revisión guardada.
                          Actualiza comparables para analizar los supuestos de
                          esta vista previa.
                        </p>`
                      : ""}
                    <div class="assessment-top">
                      <div>
                        <strong>${verdictLabels[analysis.verdict]}</strong>
                        <p>${analysis.explanation}</p>
                      </div>
                      <span class="chip"
                        >Confianza
                        ${analysis.confidence === "medium"
                          ? "media"
                          : "baja"}</span
                      >
                    </div>
                    <div class="verdict-metrics">
                      <div>
                        <small>Precio publicado</small
                        ><strong>${euro(analysis.subjectPrice)}</strong
                        ><small>${euro(analysis.askingPricePerM2)}/m²</small>
                      </div>
                      <div>
                        <small>Mediana de anuncios</small
                        ><strong>${euro(analysis.estimatedPrice)}</strong
                        ><small>${euro(analysis.medianPricePerM2)}/m²</small>
                      </div>
                      <div>
                        <small>Rango central de anuncios</small
                        ><strong
                          >${euro(analysis.rangeLow)} –
                          ${euro(analysis.rangeHigh)}</strong
                        ><small
                          >${analysis.discountPercent === null
                            ? "Sin muestra"
                            : `${analysis.discountPercent > 0 ? "−" : "+"}${Math.abs(analysis.discountPercent)} % frente a mediana (precio publicado)`}</small
                        >
                      </div>
                    </div>
                    <p class="form-note">
                      ${analysis.sampleSize} comparables ·
                      ${analysis.recentSampleSize} con menos de 90 días ·
                      ${analysis.excludedOutlierCount} valores atípicos
                      excluidos · calculado
                      ${new Date(analysis.computedAt).toLocaleDateString(
                        "es-ES",
                      )}
                    </p>
                    <p class="form-note">
                      Precio del escenario analizado:
                      ${euro(analysis.scenarioPrice)}
                      (${euro(analysis.scenarioPricePerM2)}/m²) · diferencia
                      frente a mediana:
                      ${analysis.scenarioDiscountPercent === null
                        ? "sin estimación"
                        : `${analysis.scenarioDiscountPercent} %`}
                      · fuentes: ${analysis.sourceCount} · flujo actual:
                      ${euro(analysis.currentCashFlow)} · flujo en escenario
                      conservador: ${euro(analysis.conservativeCashFlow)}. La
                      señal de oportunidad exige flujo conservador no negativo,
                      datos recientes y ausencia de alertas contractuales o
                      hipotecarias.
                    </p>
                    ${analysis.warnings.map(
                      (warning) =>
                        html`<div class="banner-note" style="margin-top:8px">
                          ${warning}
                        </div>`,
                    )}
                    <details class="market-details">
                      <summary>Ver comparables y procedencia</summary>
                      <div class="market-list">
                        ${analysis.comparables.map(
                          (item) =>
                            html`<div class="market-row">
                              <div>
                                <strong>${item.sourceLabel}</strong>
                                <p>
                                  ${item.geography} ·
                                  ${item.price.toLocaleString("es-ES")} € ·
                                  ${item.area} m² ·
                                  ${item.pricePerM2.toLocaleString("es-ES")}
                                  €/m² · ${item.observedAt}
                                </p>
                                <p class="form-note">${item.usageTerms}</p>
                              </div>
                            </div>`,
                        )}
                      </div>
                    </details>
                  </div>`;
                })()
              : html`<p class="form-note">
                  Busca comparables para estimar el rango de precio de anuncio
                  en esta zona y tipología. FincaLens conserva el resultado en
                  una nueva revisión del informe.
                </p>`}
          </section>
          <section class="panel report-section">
            <div class="section-heading">
              <h2>Compra y financiación</h2>
              <span class="chip"
                >${euro(r.snapshot.price)} · ${r.scenario.finance}%
                financiado</span
              >
            </div>
            <div class="metrics-grid">
              <div class="metric">
                <small>Entrada estimada</small
                ><strong>${euro(r.result.entry)}</strong>
              </div>
              <div class="metric">
                <small>Cuota mensual</small
                ><strong>${euro(r.result.payment)}</strong>
              </div>
              <div class="metric">
                <small>Impuesto supuesto</small
                ><strong>${euro(r.result.tax)}</strong>
              </div>
              <div class="metric">
                <small>Gastos de compra</small
                ><strong>${euro(r.result.purchaseCosts)}</strong>
              </div>
              <div class="metric">
                <small>Inversión total</small
                ><strong>${euro(r.result.totalInvestment)}</strong>
              </div>
              <div class="metric">
                <small>Alquiler de equilibrio</small
                ><strong>${euro(r.result.breakEvenRent)}</strong>
              </div>
              <div class="metric">
                <small>Precio / m²</small
                ><strong>${euro(r.result.pricePerSquareMeter)}</strong>
              </div>
              <div class="metric">
                <small>Rentabilidad bruta</small
                ><strong>${pct(r.result.grossYield)}</strong>
              </div>
            </div>
            <div class="banner-note">
              El impuesto de compra es un porcentaje editable. No se ha
              calculado ITP/IVA autonómico, bonificaciones ni gastos registrales
              exactos.
            </div>
          </section>
          <section class="panel report-section">
            <div class="panel-head">
              <h2>Escenarios y sensibilidad</h2>
              <div class="head-actions">
                <button class="btn btn-sm" @click=${() => this.preset("base")}>
                  Base</button
                ><button
                  class="btn btn-sm"
                  @click=${() => this.preset("optimistic")}
                >
                  Optimista</button
                ><button
                  class="btn btn-sm"
                  @click=${() => this.preset("conservative")}
                >
                  Conservador
                </button>
              </div>
            </div>
            <fl-scenario-editor
              .value=${this.scenario}
              .restricted=${r.risks.some((risk) => risk.blocksFinancing)}
              @scenario-change=${(event: CustomEvent<Scenario>) => (
                (this.scenario = event.detail),
                (this.selectedMarketReference = "")
              )}
            ></fl-scenario-editor>
            <div class="form-actions">
              <button
                class="btn btn-primary"
                ?disabled=${this.busy}
                @click=${() => this.recalculate()}
              >
                ${this.busy
                  ? "Guardando…"
                  : "Guardar escenario como nueva revisión"}
              </button>
            </div>
            ${this.selectedMarketReference
              ? html`<p class="form-note">
                  Se guardará la referencia zonal seleccionada junto con esta
                  revisión.
                </p>`
              : ""}
            <div style="overflow:auto;margin-top:18px">
              <table class="comparison-table">
                <thead>
                  <tr>
                    <th>Tipo</th>
                    <th>Cuota</th>
                    <th>Flujo mensual</th>
                  </tr>
                </thead>
                <tbody>
                  ${r.result.sensitivity.map(
                    (row) =>
                      html`<tr>
                        <td>Interés ${pct(row.interest)}</td>
                        <td>${euro(row.payment)}</td>
                        <td>${euro(row.cashFlow)}</td>
                      </tr>`,
                  )}
                </tbody>
              </table>
            </div>
          </section>
          ${r.risks.length
            ? html`<section class="panel report-section">
                <h2>Alertas detectadas en la descripción</h2>
                ${r.risks.map(
                  (risk) =>
                    html`<div class="risk-row">
                      <strong>${risk.title}</strong>
                      <p>Fragmento aportado: «${risk.evidence}»</p>
                    </div>`,
                )}
              </section>`
            : ""}
          <section class="panel report-section">
            <div class="panel-head">
              <h2>Checklist de verificación</h2>
              <span class="eyebrow">SEGUIMIENTO DEL INMUEBLE</span>
            </div>
            ${r.checklist.map(
              (item) =>
                html`<label class="checklist-row"
                  ><input
                    type="checkbox"
                    .checked=${!!this.checks[item.id]}
                    @change=${(e: Event) =>
                      this.checklist(
                        item.id,
                        (e.target as HTMLInputElement).checked,
                      )}
                  /><span>${item.text}</span></label
                >`,
            )}
          </section>
        </div>
        <aside class="report-aside">
          <section class="panel">
            <h2>Datos y procedencia</h2>
            <div class="risk-row">
              <strong>Precio anunciado</strong>
              <p>
                ${euro(r.snapshot.price)} ·
                ${r.snapshot.source === "listing"
                  ? "capturado del anuncio"
                  : r.snapshot.source === "example"
                    ? "ejemplo sintético"
                    : "aportado por usuario"}
              </p>
            </div>
            <div class="risk-row">
              <strong>Alquiler</strong>
              <p>
                ${euro(r.scenario.rent)} ·
                ${r.values.rent.source === "default"
                  ? "sin informar"
                  : r.values.rent.source === "market"
                    ? "derivado de referencia zonal elegida"
                    : r.values.rent.source === "user"
                      ? "aportado por usuario"
                      : "ejemplo sintético"}
              </p>
            </div>
            ${r.marketReference
              ? html`<div class="risk-row">
                  <strong>Procedencia de la referencia</strong>
                  <p>
                    ${r.marketReference.sourceLabel} ·
                    ${r.marketReference.geography} ·
                    ${r.marketReference.rentPerM2.toLocaleString("es-ES")}
                    €/m²/mes · datos de
                    ${r.marketReference.asOf}${r.marketReference.sampleSize
                      ? ` · muestra ${r.marketReference.sampleSize}`
                      : ""}
                  </p>
                  <p>${r.marketReference.usageTerms}</p>
                </div>`
              : ""}
            <div class="risk-row">
              <strong>Confianza global</strong>
              <p>
                ${r.result.confidence === "low"
                  ? "Limitada: faltan datos o la ficha es ilustrativa"
                  : "Media: cálculo reproducible con datos del anuncio y supuestos"}
              </p>
            </div>
            ${r.result.warnings.map(
              (warning) =>
                html`<div class="banner-note" style="margin-top:10px">
                  ${warning}
                </div>`,
            )}
          </section>
          <section class="panel mt">
            <h2>Referencia de alquiler</h2>
            ${this.report.snapshot.area
              ? html`<p class="form-note">
                    Solo aparecen referencias de la misma zona escrita en el
                    anuncio (${this.report.snapshot.location}). El importe
                    calculado es un supuesto orientativo por superficie.
                  </p>
                  ${this.report.risks.some((risk) => risk.needsContractRent)
                    ? html`<p class="banner-note">
                        Esta ficha requiere comprobar primero el alquiler
                        contractual o las restricciones aplicables.
                      </p>`
                    : this.marketReferences.filter(
                          (reference) =>
                            this.normalizeGeography(reference.geography) ===
                            this.normalizeGeography(
                              this.report!.snapshot.location,
                            ),
                        ).length
                      ? this.marketReferences
                          .filter(
                            (reference) =>
                              this.normalizeGeography(reference.geography) ===
                              this.normalizeGeography(
                                this.report!.snapshot.location,
                              ),
                          )
                          .map(
                            (reference) =>
                              html`<div class="risk-row">
                                <strong
                                  >${reference.rentPerM2.toLocaleString(
                                    "es-ES",
                                  )}
                                  €/m²/mes</strong
                                >
                                <p>
                                  ${reference.sourceLabel} ·
                                  ${reference.asOf}${reference.sampleSize
                                    ? ` · n=${reference.sampleSize}`
                                    : ""}
                                </p>
                                <button
                                  class="btn btn-sm"
                                  @click=${() =>
                                    this.useMarketReference(reference)}
                                >
                                  Usar en escenario
                                </button>
                              </div>`,
                          )
                      : html`<p class="form-note">
                          No hay referencias guardadas con coincidencia exacta
                          de zona.
                        </p>`}
                  <a class="text-link" href="#!/mercado"
                    >Gestionar referencias →</a
                  >`
              : html`<p class="form-note">
                  Añade la superficie al anuncio para calcular un supuesto con
                  referencias.
                </p>`}
          </section>
          <section class="panel mt">
            <h2>Notas privadas</h2>
            <textarea
              aria-label="Notas privadas del inmueble"
              maxlength="5000"
              .value=${this.propertyNotes}
              @input=${(e: Event) =>
                (this.propertyNotes = (e.target as HTMLTextAreaElement).value)}
              style="width:100%;min-height:110px;margin:10px 0;border:1px solid var(--line);border-radius:8px;padding:10px"
            ></textarea
            ><button class="btn full" @click=${() => this.saveNotes()}>
              Guardar notas
            </button>
          </section>
          <section class="panel mt">
            <h2>Historial de precio</h2>
            ${this.observations.length
              ? this.observations.map(
                  (item) =>
                    html`<div class="settings-row">
                      <strong>${euro(item.price)}</strong
                      ><small
                        >${new Date(item.observedAt).toLocaleDateString(
                          "es-ES",
                        )}</small
                      >
                    </div>`,
                )
              : html`<p class="form-note" style="margin-top:8px">
                  Sin cambios de precio registrados.
                </p>`}
          </section>
          <section class="panel mt">
            <h2>Tu anuncio</h2>
            <p class="property-meta" style="margin:8px 0 14px">
              ${r.snapshot.location}
            </p>
            ${r.snapshot.url
              ? html`<a
                  class="btn full"
                  target="_blank"
                  rel="noreferrer"
                  href=${r.snapshot.url}
                  >Abrir anuncio original ↗</a
                >`
              : html`<span class="chip">Entrada manual</span>`}
          </section>
          <section class="panel mt">
            <h2>Decisión orientativa</h2>
            <p class="form-note" style="margin-top:10px">
              El resultado depende de los supuestos editables. Contrasta cargas,
              estado físico, alquiler permitido y financiación con
              profesionales.
            </p>
            <a class="btn full mt-sm" href="#!/comparar">Comparar en cartera</a>
          </section>
        </aside>
      </div>`;
  }
}
customElements.define("report-page", ReportPage);
