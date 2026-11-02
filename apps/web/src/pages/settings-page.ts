import { html } from "lit";
import { FincaPage } from "../page.js";
import { api, notify } from "../api.js";

type Share = {
  id: string;
  report_id: string;
  expires_at: string;
  revoked: number;
};
export class SettingsPage extends FincaPage {
  static properties = {
    shares: { state: true },
    error: { state: true },
    busy: { state: true },
    accountMode: { state: true },
    displayName: { state: true },
  };
  declare shares: Share[];
  declare error: string;
  declare busy: boolean;
  declare accountMode: boolean;
  declare displayName: string;
  constructor() {
    super();
    this.shares = [];
    this.error = "";
    this.busy = false;
    this.accountMode = false;
    this.displayName = "";
  }
  protected async load() {
    try {
      const [shares, session] = await Promise.all([
        api<Share[]>("/v1/shares"),
        api<{ mode: string; displayName: string }>("/v1/session"),
      ]);
      this.shares = shares;
      this.accountMode = session.mode === "accounts";
      this.displayName = session.displayName;
    } catch (e) {
      this.error = this.message(e);
    }
  }
  private async logout() {
    await api("/v1/auth/logout", { method: "POST", body: "{}" });
    location.reload();
  }
  private async revoke(id: string) {
    try {
      await api(`/v1/shares/${id}`, { method: "DELETE" });
      await this.load();
      notify("Enlace revocado.");
    } catch (e) {
      this.error = this.message(e);
    }
  }
  render() {
    return html`<header class="page-head">
        <div>
          <div class="eyebrow">PREFERENCIAS Y PRIVACIDAD</div>
          <h1>Ajustes</h1>
          <p class="subtitle">
            Controla los enlaces compartidos y el espacio local.
          </p>
        </div>
      </header>
      ${this.error
        ? html`<div role="alert" class="banner-note">${this.error}</div>`
        : ""}
      <section class="panel">
        <div class="panel-head">
          <div>
            <h2>Enlaces de informes</h2>
            <p class="form-note">
              Los enlaces son públicos para quien los tenga y caducan en siete
              días.
            </p>
          </div>
        </div>
        ${this.shares.length
          ? this.shares.map(
              (share) =>
                html`<div class="settings-row">
                  <div>
                    <strong>Informe ${share.report_id.slice(0, 8)}</strong>
                    <p>
                      ${share.revoked
                        ? "Revocado"
                        : `Caduca ${new Date(share.expires_at).toLocaleString("es-ES")}`}
                    </p>
                  </div>
                  ${share.revoked
                    ? ""
                    : html`<button
                        class="btn btn-sm"
                        @click=${() => this.revoke(share.id)}
                      >
                        Revocar
                      </button>`}
                </div>`,
            )
          : html`<div class="empty-state">
              <h2>Aún no has compartido informes</h2>
              <p>
                Desde cualquier informe puedes crear un enlace de solo lectura y
                revocarlo aquí.
              </p>
            </div>`}
      </section>
      <section class="panel report-section">
        <h2>Espacio de trabajo</h2>
        <div class="settings-row">
          <div>
            <strong>Cuenta</strong>
            <p>
              ${this.displayName || "Espacio local"} ·
              ${this.accountMode
                ? "cuenta independiente"
                : "modo local de usuario único"}
            </p>
          </div>
          ${this.accountMode
            ? html`<button class="btn btn-sm" @click=${() => this.logout()}>
                Cerrar sesión
              </button>`
            : html`<span class="chip">Solo local</span>`}
        </div>
        <div class="settings-row">
          <div>
            <strong>Datos externos</strong>
            <p>
              No hay proveedor de rentas de mercado ni servicios de IA
              configurados.
            </p>
          </div>
          <span class="chip">Sin proveedor</span>
        </div>
        <div class="banner-note">
          ${this.accountMode
            ? "El modo de cuentas está pensado para desarrollo local: todavía no incluye verificación de correo, recuperación de contraseña ni protección de despliegue público."
            : "Este espacio local no ofrece separación por cuentas. No incluyas información personal sensible."}
        </div>
      </section>
      <section class="panel report-section">
        <h2>Acerca del motor</h2>
        <p class="form-note" style="margin-top:10px">
          Cálculo reproducible con versión explícita, supuestos editables,
          escenarios inmutables y fuentes registradas por campo. La puntuación
          solo refleja factores financieros.
        </p>
      </section>`;
  }
}
customElements.define("settings-page", SettingsPage);
