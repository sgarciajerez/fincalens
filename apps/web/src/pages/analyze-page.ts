import { html } from "lit";
import { FincaPage } from "../page.js";
import { api, notify } from "../api.js";
import type { ListingSnapshot } from "@fincalens/contracts";

export class AnalyzePage extends FincaPage {
  static properties = { busy: { state: true }, error: { state: true } };
  declare busy: boolean;
  declare error: string;
  constructor() {
    super();
    this.busy = false;
    this.error = "";
  }
  private async submit(event: SubmitEvent) {
    event.preventDefault();
    const form = event.currentTarget as HTMLFormElement;
    const data = new FormData(form);
    this.busy = true;
    this.error = "";
    try {
      const price = Number(data.get("price")),
        rentRaw = String(data.get("rent") || "").trim(),
        portal = String(data.get("portal")) as ListingSnapshot["portal"];
      const snapshot: ListingSnapshot = {
        schemaVersion: "1",
        portal,
        listingId: null,
        url: portal === "idealista" ? String(data.get("url")).trim() : null,
        capturedAt: new Date().toISOString(),
        extractorVersion: "manual-1",
        title: String(data.get("title")).trim(),
        propertyType: String(
          data.get("propertyType"),
        ) as ListingSnapshot["propertyType"],
        location: String(data.get("location")).trim(),
        price,
        area: Number(data.get("area")) || null,
        bedrooms: data.get("bedrooms") ? Number(data.get("bedrooms")) : null,
        bathrooms: null,
        floor: null,
        hasLift: null,
        energyRating: null,
        condition: "unknown",
        buildingYear: null,
        areaUsable: null,
        description: String(data.get("description") || ""),
        features: [],
        source: "user",
        rent: rentRaw ? Number(rentRaw) : null,
        rentSource: rentRaw ? "user" : "unknown",
        previousAdvertisedPrice: null,
      };
      const job = await api<{ id: string }>("/v1/analysis-jobs", {
        method: "POST",
        body: JSON.stringify({ snapshot }),
      });
      for (let i = 0; i < 35; i++) {
        await new Promise((r) => setTimeout(r, 250));
        const current = await api<{
          status: string;
          reportId: string | null;
          error: string | null;
        }>(`/v1/analysis-jobs/${job.id}`);
        if (
          current.status === "completed" ||
          current.status === "completed_partial"
        ) {
          location.hash = `#!/informe/${current.reportId}`;
          return;
        }
        if (current.status === "failed")
          throw new Error(
            current.error || "No se ha podido generar el informe.",
          );
      }
      throw new Error(
        "El análisis sigue en cola. Vuelve a la cartera en unos segundos.",
      );
    } catch (error) {
      this.error = this.message(error);
    } finally {
      this.busy = false;
    }
  }
  render() {
    return html`<header class="page-head">
        <div>
          <div class="eyebrow">NUEVO ANÁLISIS</div>
          <h1>Analizar inmueble</h1>
          <p class="subtitle">
            Crea una primera ficha con datos del anuncio y completa los
            supuestos que conozcas.
          </p>
        </div>
      </header>
      <div class="form-layout">
        <section class="panel form-panel">
          <form @submit=${(e: SubmitEvent) => this.submit(e)}>
            <div class="form-field">
              <label for="portal">Origen del inmueble</label
              ><select id="portal" name="portal">
                <option value="manual">Entrada manual</option>
                <option value="idealista">Anuncio público de Idealista</option>
              </select>
            </div>
            <div class="form-field">
              <label for="url">URL del anuncio de Idealista (si aplica)</label
              ><input
                id="url"
                name="url"
                type="url"
                placeholder="https://www.idealista.com/inmueble/12345678/"
              />
            </div>
            <div class="form-field">
              <label for="title">Nombre o título del inmueble</label
              ><input
                id="title"
                name="title"
                required
                maxlength="160"
                placeholder="Piso de dos habitaciones en Valencia"
              />
            </div>
            <div class="form-field">
              <label for="propertyType">Tipo de inmueble</label>
              <select id="propertyType" name="propertyType">
                <option value="flat">Piso / apartamento</option>
                <option value="house">Casa / chalet</option>
                <option value="room">Habitación</option>
                <option value="other">Otro</option>
                <option value="unknown">No lo sé</option>
              </select>
            </div>
            <div class="form-field">
              <label for="location">Zona</label
              ><input
                id="location"
                name="location"
                maxlength="200"
                placeholder="Barrio · Ciudad"
              />
            </div>
            <div class="form-row">
              <div class="form-field">
                <label for="price">Precio (€)</label
                ><input
                  id="price"
                  name="price"
                  type="number"
                  min="1000"
                  step="1000"
                  required
                />
              </div>
              <div class="form-field">
                <label for="area">Superficie construida (m²)</label
                ><input id="area" name="area" type="number" min="1" step="1" />
              </div>
            </div>
            <div class="form-field">
              <label for="bedrooms">Habitaciones</label>
              <input
                id="bedrooms"
                name="bedrooms"
                type="number"
                min="0"
                max="100"
                step="1"
                placeholder="Opcional"
              />
            </div>
            <div class="form-field">
              <label for="rent">Alquiler mensual estimado (€)</label
              ><input
                id="rent"
                name="rent"
                type="number"
                min="0"
                step="25"
                placeholder="Déjalo vacío si aún no lo sabes"
              />
            </div>
            <div class="form-field">
              <label for="description"
                >Descripción y condiciones relevantes</label
              ><textarea
                id="description"
                name="description"
                maxlength="30000"
                placeholder="Copia aquí las condiciones del anuncio que quieras revisar. No pegues datos personales."
              ></textarea>
            </div>
            <p class="form-note">
              El análisis financiero usa tus supuestos. La renta, impuestos,
              estado registral y financiación no se verifican automáticamente.
            </p>
            ${this.error
              ? html`<p role="alert" class="red">${this.error}</p>`
              : ""}
            <div class="form-actions">
              <a class="btn" href="#!/">Cancelar</a
              ><button
                class="btn btn-primary"
                type="submit"
                ?disabled=${this.busy}
              >
                ${this.busy ? "Generando informe…" : "Generar informe"}
              </button>
            </div>
          </form>
        </section>
        <aside class="panel">
          <h2>Qué recibirás</h2>
          <ul class="help-list">
            <li>Costes iniciales y capital necesario</li>
            <li>Cuota hipotecaria y flujo mensual</li>
            <li>Rentabilidades bruta y neta si informas el alquiler</li>
            <li>Alertas basadas en el texto que aportes</li>
            <li>Checklist para verificar documentación</li>
          </ul>
          <div class="banner-note">
            Si no se conoce el alquiler, el informe lo muestra como pendiente en
            lugar de inventar un valor de mercado.
          </div>
        </aside>
      </div>`;
  }
}
customElements.define("analyze-page", AnalyzePage);
