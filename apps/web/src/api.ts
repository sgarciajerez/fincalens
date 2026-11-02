export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(path, {
    credentials: "same-origin",
    ...init,
    headers: { "content-type": "application/json", ...init.headers },
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error || `Error ${response.status}`);
  return body as T;
}

export const euro = (value: number | null | undefined) =>
  value == null
    ? "—"
    : new Intl.NumberFormat("es-ES", { maximumFractionDigits: 0 }).format(
        Math.round(value),
      ) + " €";
export const pct = (value: number | null | undefined) =>
  value == null
    ? "—"
    : new Intl.NumberFormat("es-ES", {
        minimumFractionDigits: 1,
        maximumFractionDigits: 1,
      }).format(value) + " %";
export function notify(message: string) {
  publish("fincalens:toast", message);
  window.dispatchEvent(new CustomEvent("fl-toast", { detail: message }));
}
import { publish } from "@open-cells/core";
