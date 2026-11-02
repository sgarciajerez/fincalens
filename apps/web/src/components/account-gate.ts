import { LitElement, html } from "lit";
import { api } from "../api.js";

export class AccountGate extends LitElement {
  static properties = {
    register: { state: true },
    busy: { state: true },
    error: { state: true },
  };
  declare register: boolean;
  declare busy: boolean;
  declare error: string;
  constructor() {
    super();
    this.register = false;
    this.busy = false;
    this.error = "";
  }
  createRenderRoot() {
    return this;
  }
  private async submit(event: SubmitEvent) {
    event.preventDefault();
    const form = event.currentTarget as HTMLFormElement;
    const data = new FormData(form);
    this.busy = true;
    this.error = "";
    try {
      await api(this.register ? "/v1/auth/register" : "/v1/auth/login", {
        method: "POST",
        body: JSON.stringify({
          email: String(data.get("email")),
          password: String(data.get("password")),
        }),
      });
      location.reload();
    } catch (error) {
      this.error =
        error instanceof Error ? error.message : "No se pudo iniciar sesión.";
    } finally {
      this.busy = false;
    }
  }
  render() {
    return html`<section class="account-card">
      <a class="brand account-brand" href="#!/"
        ><img src="/brand.svg" width="38" height="38" alt="" /><span
          >FincaLens</span
        ></a
      >
      <div class="eyebrow">ESPACIO PERSONAL</div>
      <h1>${this.register ? "Crea tu cuenta local" : "Inicia sesión"}</h1>
      <p class="subtitle">
        ${this.register
          ? "Cada cuenta mantiene su propia cartera e informes."
          : "Accede a tus inmuebles e informes guardados."}
      </p>
      <form
        class="account-form"
        @submit=${(event: SubmitEvent) => this.submit(event)}
      >
        <label for="account-email">Correo electrónico</label>
        <input
          id="account-email"
          name="email"
          type="email"
          autocomplete="email"
          required
          maxlength="254"
        />
        <label for="account-password">Contraseña</label>
        <input
          id="account-password"
          name="password"
          type="password"
          autocomplete=${this.register ? "new-password" : "current-password"}
          minlength="12"
          maxlength="128"
          required
        />
        ${this.register
          ? html`<small>Usa una contraseña de al menos 12 caracteres.</small>`
          : ""}
        ${this.error
          ? html`<p class="account-error" role="alert">${this.error}</p>`
          : ""}
        <button
          class="btn btn-primary full"
          type="submit"
          ?disabled=${this.busy}
        >
          ${this.busy
            ? "Un momento…"
            : this.register
              ? "Crear cuenta"
              : "Entrar"}
        </button>
      </form>
      <button
        class="inline-button account-toggle"
        @click=${() => {
          this.register = !this.register;
          this.error = "";
        }}
      >
        ${this.register ? "Ya tengo cuenta · Iniciar sesión" : "Crear cuenta"}
      </button>
      <p class="account-disclaimer">
        Modo de cuentas local. No hay verificación de correo ni recuperación de
        contraseña. No lo expongas a Internet.
      </p>
    </section>`;
  }
}

customElements.define("fl-account-gate", AccountGate);
