import { LitElement, html } from "lit";
import { startApp } from "@open-cells/core";
import { ElementController } from "@open-cells/element-controller";
import { api } from "./api.js";
import "./components/property-card.js";

export class AppRoot extends LitElement {
  static properties = {
    toastMessage: { state: true },
    online: { state: true },
    current: { state: true },
  };
  static get inbounds() {
    return {
      channelToast: {
        channel: "fincalens:toast",
        action: (value: unknown) =>
          String((value as { value?: unknown })?.value ?? value),
      },
    };
  }
  declare toastMessage: string;
  declare online: boolean;
  declare current: string;
  declare channelToast: string;
  private controller: ElementController;
  private toastTimer: number | undefined;
  constructor() {
    super();
    this.toastMessage = "";
    this.online = true;
    this.current = "portfolio";
    this.controller = new ElementController(this);
  }
  createRenderRoot() {
    return this;
  }
  firstUpdated() {
    window.addEventListener("fl-toast", this.onToast as EventListener);
    window.addEventListener("hashchange", this.onRoute);
    void api("/v1/session")
      .then(() => {
        this.online = true;
        startApp({
          mainNode: "main-content",
          viewLimit: 3,
          routes: [
            {
              name: "portfolio",
              path: "/",
              component: "portfolio-page",
              action: () => import("./pages/portfolio-page.js"),
            },
            {
              name: "analyze",
              path: "/analizar",
              component: "analyze-page",
              action: () => import("./pages/analyze-page.js"),
            },
            {
              name: "report",
              path: "/informe/:id",
              component: "report-page",
              action: () => import("./pages/report-page.js"),
            },
            {
              name: "compare",
              path: "/comparar",
              component: "compare-page",
              action: () => import("./pages/compare-page.js"),
            },
            {
              name: "extension",
              path: "/extension",
              component: "extension-page",
              action: () => import("./pages/extension-page.js"),
            },
            {
              name: "settings",
              path: "/ajustes",
              component: "settings-page",
              action: () => import("./pages/settings-page.js"),
            },
            {
              name: "shared",
              path: "/compartido/:token",
              component: "shared-page",
              action: () => import("./pages/shared-page.js"),
            },
            {
              name: "not-found",
              path: "*",
              component: "not-found-page",
              notFound: true,
              action: async () => {},
            },
          ],
        });
        this.onRoute();
      })
      .catch(() => {
        this.online = false;
        this.requestUpdate();
      });
  }
  updated() {
    if (this.channelToast && this.channelToast !== this.toastMessage)
      this.showToast(this.channelToast);
  }
  disconnectedCallback() {
    super.disconnectedCallback();
    window.removeEventListener("fl-toast", this.onToast as EventListener);
    window.removeEventListener("hashchange", this.onRoute);
    clearTimeout(this.toastTimer);
  }
  private onToast = (event: CustomEvent<string>) =>
    this.showToast(event.detail);
  private showToast(message: string) {
    this.toastMessage = message;
    clearTimeout(this.toastTimer);
    this.toastTimer = window.setTimeout(() => (this.toastMessage = ""), 4200);
  }
  private onRoute = () => {
    const path = location.hash.replace(/^#!?\/?/, "").split("/")[0];
    this.current =
      (
        {
          informe: "report",
          analizar: "analyze",
          comparar: "compare",
          extension: "extension",
          ajustes: "settings",
          compartido: "shared",
        } as Record<string, string>
      )[path] || "portfolio";
  };
  private nav(event: MouseEvent) {
    const anchor = (event.target as HTMLElement).closest<HTMLAnchorElement>(
      "a[data-nav]",
    );
    if (anchor) {
      event.preventDefault();
      location.hash = anchor.getAttribute("href")?.replace(/^#/, "") || "!/";
    }
  }
  render() {
    return html`<div class="app-shell">
      <aside class="sidebar">
        <a class="brand" href="#!/"
          ><img src="/brand.svg" width="34" height="34" alt="" /><span
            >FincaLens</span
          ></a
        >
        <div class="workspace-picker">
          <span class="workspace-icon">⌂</span
          ><span
            >Mi espacio<small
              style="display:block;color:var(--muted);font-size:9px"
              >Análisis inmobiliario</small
            ></span
          >
        </div>
        <div class="nav-label">ANÁLISIS</div>
        <nav
          class="nav"
          aria-label="Navegación principal"
          @click=${(e: MouseEvent) => this.nav(e)}
        >
          <a
            data-nav
            href="#!/"
            class=${this.current === "portfolio" ? "active" : ""}
            >▦ <span>Mi cartera</span></a
          ><a
            data-nav
            href="#!/analizar"
            class=${this.current === "analizar" ? "active" : ""}
            >＋ <span>Analizar inmueble</span></a
          ><a
            data-nav
            href="#!/comparar"
            class=${this.current === "comparar" ? "active" : ""}
            >⇄ <span>Comparar</span></a
          >
        </nav>
        <div class="nav-label" style="margin-top:24px">HERRAMIENTAS</div>
        <nav
          class="nav"
          aria-label="Herramientas"
          @click=${(e: MouseEvent) => this.nav(e)}
        >
          <a
            data-nav
            href="#!/extension"
            class=${this.current === "extension" ? "active" : ""}
            >⌁ <span>Extensión</span></a
          ><a
            data-nav
            href="#!/ajustes"
            class=${this.current === "ajustes" ? "active" : ""}
            >⚙ <span>Ajustes</span></a
          >
        </nav>
        <div class="sidebar-spacer"></div>
        <div class="extension-promo">
          <span class="chip chip-good">CHROME MV3</span>
          <h4>Analiza desde Idealista</h4>
          <p>Captura los datos del anuncio y crea un informe en segundos.</p>
          <a data-nav class="text-link" href="#!/extension"
            >Conectar extensión →</a
          >
        </div>
        <div class="sidebar-bottom">
          <div class="profile">
            <div class="avatar">FL</div>
            <div>
              <strong>Mi espacio</strong
              ><small>${this.online ? "Modo local" : "API sin conexión"}</small>
            </div>
          </div>
        </div>
      </aside>
      <div class="layout-main">
        <div class="topbar">
          <div class="breadcrumb">
            <span>FincaLens</span><span>›</span
            ><strong
              >${this.current === "portfolio"
                ? "Mi cartera"
                : this.current === "report"
                  ? "Informe"
                  : this.current === "analyze"
                    ? "Nuevo análisis"
                    : this.current === "compare"
                      ? "Comparar"
                      : this.current === "extension"
                        ? "Extensión"
                        : this.current === "settings"
                          ? "Ajustes"
                          : "Informe compartido"}</strong
            >
          </div>
          <div class="top-actions">
            <span class="topbar-status"
              >${this.online
                ? "Datos guardados localmente"
                : "No se pudo conectar con la API local"}</span
            ><span class="demo-tag"><i>⌘</i> DESARROLLO</span>
          </div>
        </div>
        <nav class="mobile-nav" aria-label="Accesos rápidos">
          <a href="#!/">Cartera</a><a href="#!/analizar">Analizar</a>
          <a href="#!/comparar">Comparar</a><a href="#!/extension">Extensión</a>
          <a href="#!/ajustes">Ajustes</a>
        </nav>
        <main id="main-content" class="content"></main>
      </div>
      ${this.toastMessage
        ? html`<div class="toast" role="status">${this.toastMessage}</div>`
        : ""}
    </div>`;
  }
}
customElements.define("fl-app", AppRoot);
