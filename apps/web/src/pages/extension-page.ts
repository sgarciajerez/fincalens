import { html } from "lit";
import { FincaPage } from "../page.js";
import { api } from "../api.js";

export class ExtensionPage extends FincaPage {
  static properties = {
    code: { state: true },
    expires: { state: true },
    error: { state: true },
    busy: { state: true },
  };
  declare code: string;
  declare expires: number;
  declare error: string;
  declare busy: boolean;
  constructor() {
    super();
    this.code = "";
    this.expires = 0;
    this.error = "";
    this.busy = false;
  }
  private async connect() {
    this.busy = true;
    this.error = "";
    try {
      const result = await api<{ code: string; expiresIn: number }>(
        "/v1/pairing",
        { method: "POST", body: "{}" },
      );
      this.code = result.code;
      this.expires = result.expiresIn;
    } catch (e) {
      this.error = this.message(e);
    } finally {
      this.busy = false;
    }
  }
  render() {
    return html`<header class="page-head">
        <div>
          <div class="eyebrow">CAPTURA DESDE EL ANUNCIO</div>
          <h1>Extensión FincaLens</h1>
          <p class="subtitle">
            Envía anuncios de Idealista a tu cartera con un clic, sin copiar
            datos a mano.
          </p>
        </div>
      </header>
      <section class="panel extension-card">
        <div>
          <span class="chip chip-good">CHROME · MANIFEST V3</span>
          <h2 style="margin:14px 0 8px">Conecta tu extensión</h2>
          <p class="property-meta">
            Introduce el código de un solo uso en la extensión. Caduca en cinco
            minutos.
          </p>
          ${this.code
            ? html`<div
                class="pairing-code"
                aria-label="Código de emparejamiento"
              >
                ${this.code}
              </div>`
            : ""}${this.error
            ? html`<p role="alert" class="red">${this.error}</p>`
            : ""}<button
            class="btn btn-primary"
            style="margin-top:16px"
            ?disabled=${this.busy}
            @click=${() => this.connect()}
          >
            ${this.busy
              ? "Generando código…"
              : this.code
                ? "Generar otro código"
                : "Generar código de conexión"}
          </button>
        </div>
        <div
          class="workspace-icon"
          style="width:90px;height:90px;border-radius:22px;font-size:36px"
        >
          ⌁
        </div>
      </section>
      <section class="panel report-section">
        <h2>Cómo instalarla en desarrollo</h2>
        <ol class="help-list">
          <li>
            Descarga el código del repositorio y ejecuta
            <code>npm install</code> y <code>npm run build</code>.
          </li>
          <li>
            Abre <code>chrome://extensions</code> y activa el modo
            desarrollador.
          </li>
          <li>
            Pulsa «Cargar descomprimida» y elige <code>dist/extension</code>.
          </li>
          <li>Vuelve aquí, genera un código e introdúcelo en el popup.</li>
          <li>En un anuncio de Idealista, pulsa «Analizar con FincaLens».</li>
        </ol>
        <div class="banner-note">
          La extensión solo lee el contenido visible del anuncio abierto. No
          captura credenciales, chats ni información de otros sitios.
        </div>
      </section>`;
  }
}
customElements.define("extension-page", ExtensionPage);
