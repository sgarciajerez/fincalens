import {
  captureIdealistaDocument,
  isIdealistaListing,
  normalizeIdealista,
  type RawCapture,
} from "../../../packages/portal-adapters/src/idealista.js";
import type { AnalysisJob, PropertySummary } from "@fincalens/contracts";

const API = "http://127.0.0.1:4174/v1";
const connection = document.querySelector<HTMLElement>("#connection")!;
const capture = document.querySelector<HTMLElement>("#capture")!;
const message = document.querySelector<HTMLElement>("#message")!;
type Stored = { token?: string };
const tell = (text: string, error = false) => {
  message.textContent = text;
  message.classList.toggle("error", error);
};
const json = async <T>(path: string, init: RequestInit = {}) => {
  const response = await fetch(`${API}${path}`, {
    ...init,
    headers: { "content-type": "application/json", ...(init.headers || {}) },
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok)
    throw new Error(
      data.error || `API local no disponible (${response.status})`,
    );
  return data as T;
};
async function render() {
  const { token } = (await chrome.storage.local.get("token")) as Stored;
  connection.innerHTML = "";
  capture.innerHTML = "";
  if (token) {
    const card = document.createElement("div");
    card.className = "panel";
    const h = document.createElement("h2");
    h.textContent = "Extensión conectada";
    const status = document.createElement("span");
    status.className = "status";
    status.textContent = "LISTA";
    const p = document.createElement("p");
    p.className = "muted";
    p.textContent =
      "La conexión local está guardada de forma segura en Chrome.";
    const disconnect = document.createElement("button");
    disconnect.className = "secondary";
    disconnect.textContent = "Desconectar";
    disconnect.addEventListener("click", async () => {
      disconnect.disabled = true;
      try {
        await json("/installations/current", {
          method: "DELETE",
          headers: { authorization: `Bearer ${token}` },
        });
        await chrome.storage.local.remove("token");
        await render();
        tell("Extensión desconectada y token revocado.");
      } catch (error) {
        tell(
          error instanceof Error
            ? error.message
            : "No se ha podido revocar el token.",
          true,
        );
      } finally {
        disconnect.disabled = false;
      }
    });
    card.append(h, status, p, disconnect);
    connection.append(card);
    const analyze = document.createElement("div");
    analyze.className = "panel";
    const title = document.createElement("h2");
    title.textContent = "Analizar anuncio actual";
    const desc = document.createElement("p");
    desc.textContent =
      "Abre una ficha pública de vivienda en Idealista y captura sus datos visibles.";
    const button = document.createElement("button");
    button.textContent = "Capturar anuncio";
    button.addEventListener("click", () => void runAnalysis(token, button));
    analyze.append(title, desc, button);
    capture.append(analyze);
    const [tab] = await chrome.tabs.query({
      active: true,
      currentWindow: true,
    });
    if (tab?.id && tab.url && isIdealistaListing(tab.url)) {
      try {
        const [captured] = await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          func: captureIdealistaDocument,
        });
        const snapshot = normalizeIdealista(captured.result as RawCapture);
        await json("/observations", {
          method: "POST",
          headers: { authorization: `Bearer ${token}` },
          body: JSON.stringify({
            url: snapshot.url,
            price: snapshot.price,
            observedAt: snapshot.capturedAt,
          }),
        });
        const properties = await json<PropertySummary[]>("/properties", {
          headers: { authorization: `Bearer ${token}` },
        });
        const current = properties.find(
          (item) =>
            item.url &&
            new URL(item.url).pathname === new URL(tab.url!).pathname,
        );
        if (current && current.observations.length > 1) {
          const first = current.observations[0]!;
          const last = current.observations.at(-1)!;
          const change = first.price - last.price;
          const signal = document.createElement("p");
          signal.className = "muted";
          signal.textContent =
            change > 0
              ? `Precio observado: bajó ${change.toLocaleString("es-ES")} € desde ${new Date(first.observedAt).toLocaleDateString("es-ES")}. Última observación: ${new Date(last.observedAt).toLocaleDateString("es-ES")}.`
              : change < 0
                ? `Precio observado: subió ${Math.abs(change).toLocaleString("es-ES")} € desde ${new Date(first.observedAt).toLocaleDateString("es-ES")}.`
                : `Precio sin cambios entre ${current.observations.length} observaciones. La última fue ${new Date(last.observedAt).toLocaleDateString("es-ES")}.`;
          analyze.insertBefore(signal, button);
        }
      } catch {
        // A history lookup should not prevent capturing the current listing.
      }
    }
  } else {
    const card = document.createElement("form");
    card.className = "panel";
    const h = document.createElement("h2");
    h.textContent = "Conecta con tu espacio local";
    const p = document.createElement("p");
    p.textContent =
      "Abre FincaLens → Extensión, genera un código temporal e introdúcelo aquí.";
    const label = document.createElement("label");
    label.htmlFor = "pair-code";
    label.textContent = "Código de ocho dígitos";
    const input = document.createElement("input");
    input.id = "pair-code";
    input.inputMode = "numeric";
    input.pattern = "[0-9]{8}";
    input.maxLength = 8;
    input.required = true;
    const button = document.createElement("button");
    button.textContent = "Conectar extensión";
    card.append(h, p, label, input, button);
    card.addEventListener("submit", async (event) => {
      event.preventDefault();
      button.disabled = true;
      try {
        const result = await json<{ token: string }>("/installations", {
          method: "POST",
          body: JSON.stringify({ code: input.value }),
        });
        await chrome.storage.local.set({ token: result.token });
        await render();
        tell("Conexión establecida.");
      } catch (error) {
        tell(
          error instanceof Error ? error.message : "No se ha podido conectar.",
          true,
        );
      } finally {
        button.disabled = false;
      }
    });
    connection.append(card);
  }
}

async function runAnalysis(token: string, button: HTMLButtonElement) {
  button.disabled = true;
  button.textContent = "Leyendo anuncio…";
  tell("");
  try {
    const [tab] = await chrome.tabs.query({
      active: true,
      currentWindow: true,
    });
    if (!tab?.id || !tab.url || !isIdealistaListing(tab.url))
      throw new Error(
        "Abre primero una ficha de vivienda en www.idealista.com.",
      );
    const [captured] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: captureIdealistaDocument,
    });
    const snapshot = normalizeIdealista(captured.result as RawCapture);
    button.textContent = "Generando informe…";
    const job = await json<AnalysisJob>("/analysis-jobs", {
      method: "POST",
      headers: { authorization: `Bearer ${token}` },
      body: JSON.stringify({ snapshot }),
    });
    let reportId = job.reportId;
    for (let attempt = 0; attempt < 40 && !reportId; attempt++) {
      await new Promise((resolve) => setTimeout(resolve, 250));
      const current = await json<AnalysisJob>(`/analysis-jobs/${job.id}`, {
        headers: { authorization: `Bearer ${token}` },
      });
      if (current.status === "failed")
        throw new Error(current.error || "El anuncio no ha podido procesarse.");
      reportId = current.reportId;
    }
    if (!reportId)
      throw new Error(
        "El análisis continúa. Abre FincaLens para consultar la cartera en unos segundos.",
      );
    await chrome.tabs.create({
      url: `http://127.0.0.1:4173/#!/informe/${encodeURIComponent(reportId)}`,
    });
    tell("Informe creado. Abriendo FincaLens.");
  } catch (error) {
    tell(
      error instanceof Error
        ? error.message
        : "No se ha podido leer el anuncio.",
      true,
    );
  } finally {
    button.disabled = false;
    button.textContent = "Capturar anuncio actual";
  }
}
void render().catch((error) =>
  tell(
    error instanceof Error ? error.message : "No se pudo iniciar la extensión.",
    true,
  ),
);
