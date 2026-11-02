import { calculate, mortgagePayment } from "./finance.js";

const icons = {
  house:
    '<path d="m3 10 9-7 9 7v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1Z"/><path d="M9 21v-8h6v8"/>',
  grid: '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>',
  layers:
    '<path d="m12 3 10 5-10 5L2 8Z"/><path d="m2 12 10 5 10-5M2 16l10 5 10-5"/>',
  compare:
    '<path d="M8 3v18M16 3v18M3 7h10M11 17h10"/><circle cx="8" cy="7" r="2" fill="currentColor"/><circle cx="16" cy="17" r="2" fill="currentColor"/>',
  bookmark: '<path d="M5 3h14v19l-7-5-7 5Z"/>',
  puzzle:
    '<path d="M8 3v4a3 3 0 1 1 0 6v5h5a3 3 0 1 0 6 0h3V6h-5a3 3 0 1 0-6 0H8"/>',
  settings:
    '<circle cx="12" cy="12" r="3"/><path d="m10 2-.7 3-2.5 1.5L4 6l-2 4 2.5 2v2L2 16l2 4 3-.5L9.5 21l.5 2h4l.7-3 2.5-1.5 2.8.5 2-4-2.5-2v-2L22 9l-2-4-3 .5L14.5 4 14 2Z" transform="translate(1 0) scale(.9)"/>',
  bell: '<path d="M5 16h14l-2-3V9a5 5 0 0 0-10 0v4Zm4 4h6"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  download: '<path d="M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5"/>',
  "arrow-right": '<path d="M4 12h16m-6-6 6 6-6 6"/>',
  "arrow-left": '<path d="M20 12H4m6-6-6 6 6 6"/>',
  "arrow-up-right": '<path d="M5 19 19 5M5 5h14v14"/>',
  trending: '<path d="m3 17 6-6 4 4 8-10M15 5h6v6"/>',
  "trend-down": '<path d="m3 7 6 6 4-4 8 10m-6 0h6v-6"/>',
  spark:
    '<path d="m12 3 2.3 6.7L21 12l-6.7 2.3L12 21l-2.3-6.7L3 12l6.7-2.3Z"/>',
  search: '<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/>',
  list: '<path d="M8 5h13M8 12h13M8 19h13M3 5h.1M3 12h.1M3 19h.1"/>',
  heart:
    '<path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0l-1 1-1-1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 0 0 0-7.8Z"/>',
  pin: '<path d="M19 10c0 5-7 11-7 11S5 15 5 10a7 7 0 1 1 14 0Z"/><circle cx="12" cy="10" r="2"/>',
  area: '<rect x="4" y="4" width="16" height="16" rx="1"/><path d="M8 16 16 8m-5 0h5v5"/>',
  bed: '<path d="M3 19V9m18 10V9M3 15h18M5 9V5h14v4M3 9h18v6"/>',
  building:
    '<path d="M5 21V3h14v18M3 21h18M9 7h1m4 0h1M9 11h1m4 0h1M9 15h1m4 0h1"/>',
  file: '<path d="M14 2H5v20h14V7Zm0 0v5h5M8 12h8M8 16h6"/>',
  "chevron-down": '<path d="m7 10 5 5 5-5"/>',
  "chevron-right": '<path d="m9 6 6 6-6 6"/>',
  "check-circle": '<circle cx="12" cy="12" r="9"/><path d="m8 12 3 3 6-7"/>',
  check: '<path d="m5 12 4 4L19 6"/>',
  alert: '<path d="M12 3 2 21h20ZM12 9v5m0 3v.1"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6m0-10v.1"/>',
  share:
    '<circle cx="5" cy="12" r="3"/><circle cx="19" cy="5" r="3"/><circle cx="19" cy="19" r="3"/><path d="m8 11 8-5M8 13l8 5"/>',
  wallet: '<path d="M21 8H4a2 2 0 0 1 0-4h15v4M3 6v14h18V8M21 12h-6v4h6"/>',
  link: '<path d="m10 13 4-4M8 16l-2 2a4 4 0 0 1-6-6l5-5a4 4 0 0 1 6 0m2 1 2-2a4 4 0 0 1 6 6l-5 5a4 4 0 0 1-6 0" transform="translate(1 0)"/>',
  edit: '<path d="m14 4 6 6M4 20l4-1L21 6l-5-5L3 14Z"/>',
  menu: '<path d="M4 6h16M4 12h16M4 18h16"/>',
};
const icon = (name, extra = "") =>
  `<svg class="icon ${extra}" viewBox="0 0 24 24" aria-hidden="true">${icons[name] || icons.house}</svg>`;
function mountIcons(root = document) {
  root
    .querySelectorAll("[data-icon]")
    .forEach((el) => (el.outerHTML = icon(el.dataset.icon)));
}
const $ = (selector) => document.querySelector(selector);
const escapeHtml = (text) =>
  String(text).replace(
    /[&<>"']/g,
    (char) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        char
      ],
  );
const euro = (value, signed = false) =>
  value === null
    ? "—"
    : `${signed && value > 0 ? "+" : ""}${new Intl.NumberFormat("es-ES", { maximumFractionDigits: 0 }).format(Math.round(value))} €`;
const percent = (value) =>
  value === null
    ? "—"
    : `${new Intl.NumberFormat("es-ES", { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(value)} %`;
const integer = (value) =>
  new Intl.NumberFormat("es-ES", { maximumFractionDigits: 0 }).format(value);
const readStorage = (key, fallback) => {
  try {
    return JSON.parse(localStorage.getItem(`fincalens:${key}`)) ?? fallback;
  } catch {
    return fallback;
  }
};
function writeStorage(key, value) {
  try {
    localStorage.setItem(`fincalens:${key}`, JSON.stringify(value));
    return true;
  } catch {
    toast("El navegador no permite guardar los cambios.");
    return false;
  }
}
let toastTimer;
function toast(message) {
  const box = $("#toast");
  box.textContent = message;
  box.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (box.hidden = true), 4500);
}
const photo = (id, width = 800) =>
  `https://images.unsplash.com/${id}?auto=format&fit=crop&w=${width}&q=80`;
const properties = [
  {
    id: "mar",
    name: "Piso en Calle del Mar",
    short: "Calle del Mar",
    location: "El Cabanyal · Valencia",
    city: "Valencia",
    price: 185000,
    rent: 1100,
    area: 72,
    beds: 2,
    baths: 1,
    floor: "2ª planta",
    drop: 5,
    image: "photo-1600585154340-be6161a56a0c",
  },
  {
    id: "olavide",
    name: "Piso en Calle de Olavide",
    short: "Calle de Olavide",
    location: "Ruzafa · Valencia",
    city: "Valencia",
    price: 269000,
    rent: 1300,
    area: 86,
    beds: 3,
    baths: 2,
    floor: "3ª planta",
    drop: 5.3,
    image: "photo-1600210492486-724fe5c67fb0",
  },
  {
    id: "naranjos",
    name: "Piso en Plaza de los Naranjos",
    short: "Plaza de los Naranjos",
    location: "Benimaclet · Valencia",
    city: "Valencia",
    price: 149000,
    rent: 950,
    area: 65,
    beds: 2,
    baths: 1,
    floor: "1ª planta",
    drop: 0,
    image: "photo-1600607687920-4e2a09cf159d",
  },
  {
    id: "brigida",
    name: "Piso en Calle de Santa Brígida",
    short: "Calle de Santa Brígida",
    location: "Justicia · Madrid",
    city: "Madrid",
    price: 990000,
    rent: 3458,
    area: 133,
    beds: 3,
    baths: 2,
    floor: "1ª planta",
    drop: 10,
    image: "photo-1600566753086-00f18fb6b3ea",
  },
  {
    id: "jerez",
    name: "Piso en Calle del Parque",
    short: "Calle del Parque",
    location: "Centro · Jerez",
    city: "Jerez",
    price: 98000,
    rent: null,
    area: 74,
    beds: 3,
    baths: 1,
    floor: "4ª planta",
    drop: 0,
    image: "photo-1600573472592-401b489a3cdc",
  },
  {
    id: "alameda",
    name: "Piso en Avenida de la Alameda",
    short: "Avenida de la Alameda",
    location: "Camins al Grau · Valencia",
    city: "Valencia",
    price: 235000,
    rent: 1100,
    area: 80,
    beds: 2,
    baths: 2,
    floor: "5ª planta",
    drop: 0,
    image: "photo-1600047509782-20d39509f26d",
  },
];
const metric = (p) =>
  calculate({ ...p, finance: 80, interest: 3.2, renovation: 0 });
const classification = (m) =>
  m.score === null
    ? ["Datos incompletos", "amber"]
    : m.score >= 70
      ? ["Oportunidad", "green"]
      : m.cf < 0
        ? ["Con cautela", "red"]
        : ["A revisar", "amber"];
let favorites = readStorage("favorites", ["mar", "naranjos"]);
if (!Array.isArray(favorites)) favorites = ["mar", "naranjos"];
let preferences = readStorage("preferences", {});
if (
  !preferences ||
  typeof preferences !== "object" ||
  Array.isArray(preferences)
)
  preferences = {};
const workspaceName =
  typeof preferences.workspace === "string"
    ? preferences.workspace.slice(0, 40)
    : "Mi espacio personal";
if (preferences.reducedMotion)
  document.documentElement.style.setProperty("scroll-behavior", "auto");
if (preferences.reducedMotion) {
  const style = document.createElement("style");
  style.textContent =
    "*,*:before,*:after{transition:none!important;animation:none!important}";
  document.head.append(style);
}

const page = document.body.dataset.page;
const labels = {
  portfolio: "Mi cartera",
  report: "Informe de inversión",
  compare: "Comparador",
  analyze: "Nuevo análisis",
  extension: "Extensión de Chrome",
  settings: "Preferencias",
};
const favoriteView =
  page === "portfolio" &&
  new URLSearchParams(location.search).get("view") === "favorites";
const navItem = (href, glyph, label, active, count = "") =>
  `<a href="${href}"${active ? ' class="active" aria-current="page"' : ""}>${icon(glyph)}${label}${count ? `<span class="nav-count">${count}</span>` : ""}</a>`;
$("#app-shell").innerHTML =
  `<aside class="sidebar" id="sidebar"><a class="brand" href="index.html"><span class="brand-mark">${icon("house")}</span>FincaLens</a><div class="workspace-picker"><span class="workspace-icon">${icon("layers", "icon-sm")}</span><span class="grow">${escapeHtml(workspaceName)}</span>${icon("chevron-down", "icon-sm")}</div><p class="nav-label">TU ESPACIO</p><nav class="nav" aria-label="Navegación principal">${navItem("index.html", "grid", "Mi cartera", page === "portfolio" && !favoriteView, "6")}${navItem("comparar.html", "compare", "Comparador", page === "compare")}${navItem("index.html?view=favorites", "heart", "Favoritos", favoriteView)}${navItem("analizar.html", "plus", "Nuevo análisis", page === "analyze")}</nav><p class="nav-label" style="margin-top:30px">HERRAMIENTAS</p><nav class="nav" aria-label="Herramientas">${navItem("extension.html", "puzzle", "Extensión de Chrome", page === "extension")}</nav><div class="sidebar-spacer"></div><div class="extension-promo">${icon("spark")}<h4>Tu búsqueda, con otra mirada.</h4><p>Analiza oportunidades desde el propio anuncio de Idealista.</p><a class="text-link" href="extension.html">Descubrir la extensión ${icon("arrow-right", "icon-sm")}</a></div><div class="sidebar-bottom"><nav class="nav" aria-label="Cuenta">${navItem("ajustes.html", "settings", "Preferencias", page === "settings")}</nav><a class="profile" href="ajustes.html"><span class="avatar">SG</span><span><strong>Santiago García</strong><small>Espacio personal · Demo</small></span>${icon("chevron-down")}</a></div></aside>`;
$("#topbar").innerHTML =
  `<header class="topbar"><button class="icon-button menu-button" id="menu-toggle" aria-expanded="false" aria-controls="sidebar" aria-label="Abrir navegación">${icon("menu")}</button><div class="breadcrumb"><a href="index.html">Mi espacio</a>${icon("chevron-right", "icon-sm")}<strong>${favoriteView ? "Favoritos" : labels[page]}</strong></div><div class="top-actions"><span class="demo-tag"><i></i>Prototipo · Datos de ejemplo</span><a class="icon-button" href="index.html#portfolio-section" aria-label="Ver inmuebles">${icon("building")}</a><a class="avatar" href="ajustes.html" aria-label="Preferencias de mi espacio">SG</a></div></header>`;
$("#page-footer").innerHTML =
  `<footer class="page-footer"><span>© 2026 FincaLens · Una perspectiva más clara.</span><span>Prototipo HTML · Datos ficticios · <a href="https://unsplash.com" target="_blank" rel="noopener noreferrer">Fotos ilustrativas: Unsplash ↗</a></span></footer>`;
mountIcons();
$("#menu-toggle").addEventListener("click", () => {
  const open = $("#sidebar").classList.toggle("open");
  $("#menu-toggle").setAttribute("aria-expanded", String(open));
  $("#menu-toggle").setAttribute(
    "aria-label",
    open ? "Cerrar navegación" : "Abrir navegación",
  );
});
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    $("#sidebar").classList.remove("open");
    $("#menu-toggle").setAttribute("aria-expanded", "false");
    $("#menu-toggle").setAttribute("aria-label", "Abrir navegación");
  }
});
document.addEventListener("click", (event) => {
  if (innerWidth <= 760 && !event.target.closest("#sidebar, #menu-toggle")) {
    $("#sidebar").classList.remove("open");
    $("#menu-toggle").setAttribute("aria-expanded", "false");
  }
});

function downloadCSV(filename, rows) {
  const safe = (value) => {
    const raw = String(value ?? "");
    const text = /^[=+@\-]/.test(raw) ? `'${raw}` : raw;
    return `"${text.replaceAll('"', '""')}"`;
  };
  const blob = new Blob(
    ["\uFEFF", rows.map((row) => row.map(safe).join(";")).join("\r\n")],
    { type: "text/csv;charset=utf-8" },
  );
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function initPortfolio() {
  let filter = favoriteView ? "favorite" : "all";
  const search = $("#property-search");
  if (favoriteView) $("#portfolio-title").textContent = "Mis favoritos";
  const computed = properties.map((p) => ({ ...p, m: metric(p) }));
  const yields = computed
    .filter((p) => p.m.netYield !== null)
    .map((p) => p.m.netYield);
  const statValues = document.querySelectorAll(".stat-value");
  statValues[1].textContent = percent(
    yields.reduce((a, b) => a + b, 0) / yields.length,
  );
  const activeItems = () => {
    const q = search.value.trim().toLocaleLowerCase("es");
    return computed.filter(
      (p) =>
        (!q || `${p.name} ${p.location}`.toLocaleLowerCase("es").includes(q)) &&
        (filter === "all" ||
          (filter === "favorite" && favorites.includes(p.id)) ||
          (filter === "opportunity" && p.m.score >= 70) ||
          (filter === "review" && p.m.score !== null && p.m.score < 70)),
    );
  };
  function render() {
    const items = activeItems();
    const sort = $("#property-sort").value;
    if (sort === "score")
      items.sort((a, b) => (b.m.score ?? -1) - (a.m.score ?? -1));
    if (sort === "price") items.sort((a, b) => a.price - b.price);
    $("#property-count").textContent = items.length;
    document.querySelectorAll("[data-filter]").forEach((button) => {
      const active = button.dataset.filter === filter;
      button.classList.toggle("active", active);
      button.setAttribute("aria-pressed", String(active));
    });
    $("#property-grid").innerHTML = items.length
      ? items
          .map((p) => {
            const [label, color] = classification(p.m);
            return `<article class="property-card"><div class="property-image"><img src="${photo(p.image)}" alt="Fotografía ilustrativa, no corresponde al inmueble" loading="lazy"><span class="image-badge">${icon("file")}INFORME DE EJEMPLO</span><button class="favorite" aria-label="${favorites.includes(p.id) ? "Quitar de" : "Añadir a"} favoritos: ${escapeHtml(p.short)}" aria-pressed="${favorites.includes(p.id)}" data-favorite="${p.id}">${icon("heart")}</button><span class="image-bottom">${icon("pin")}${p.city}</span></div><div class="property-body"><p class="card-location">${p.location}</p><h3 class="property-title"><a href="informe.html?id=${p.id}">${p.name}</a></h3><div class="property-facts"><span>${icon("area")}${p.area} m²</span><span>${icon("bed")}${p.beds} hab.</span><span>${icon("building")}${p.floor}</span></div><div class="price-line"><strong class="price">${euro(p.price)}</strong>${p.drop ? `<span class="price-change">↓ ${p.drop.toLocaleString("es-ES")} %</span>` : ""}</div><div class="card-metrics"><div><small>RENT. NETA</small><strong>${percent(p.m.netYield)}</strong></div><div><small>CASH-FLOW / MES</small><strong class="${p.m.cf === null ? "muted" : p.m.cf >= 0 ? "green" : "red"}">${euro(p.m.cf, true)}</strong></div></div><div class="card-bottom"><span class="score-badge ${color}"><span class="score-number ${color}">${p.m.score ?? "—"}</span>${label}</span><a href="informe.html?id=${p.id}">Ver informe ${icon("arrow-up-right")}</a></div></div></article>`;
          })
          .join("")
      : '<div class="empty-state"><h3>No hay inmuebles en esta selección.</h3><p>Prueba otro filtro o añade una vivienda a favoritos.</p></div>';
  }
  document.querySelectorAll("[data-filter]").forEach((button) =>
    button.addEventListener("click", () => {
      filter = button.dataset.filter;
      render();
    }),
  );
  $("#show-opportunities").addEventListener("click", () => {
    filter = "opportunity";
    render();
    $("#portfolio-section").scrollIntoView({
      behavior: preferences.reducedMotion ? "instant" : "smooth",
    });
  });
  search.addEventListener("input", render);
  $("#property-sort").addEventListener("change", render);
  $("#property-grid").addEventListener("click", (event) => {
    const button = event.target.closest("[data-favorite]");
    if (!button) return;
    const id = button.dataset.favorite;
    favorites = favorites.includes(id)
      ? favorites.filter((x) => x !== id)
      : [...favorites, id];
    writeStorage("favorites", favorites);
    render();
  });
  ["grid", "list"].forEach((view) =>
    $(`#${view}-view`).addEventListener("click", () => {
      $("#property-grid").classList.toggle("list-view", view === "list");
      ["grid", "list"].forEach((v) => {
        $(`#${v}-view`).classList.toggle("active", v === view);
        $(`#${v}-view`).setAttribute("aria-pressed", String(v === view));
      });
    }),
  );
  $("#export-portfolio").addEventListener("click", () =>
    downloadCSV("fincalens-cartera-ejemplo.csv", [
      [
        "Inmueble",
        "Zona",
        "Precio EUR",
        "Superficie m2",
        "Rentabilidad neta %",
        "Cash-flow EUR/mes",
        "Procedencia",
      ],
      ...activeItems().map((p) => [
        p.name,
        p.location,
        p.price,
        p.area,
        p.m.netYield?.toFixed(2),
        p.m.cf?.toFixed(2),
        "Datos ficticios",
      ]),
    ]),
  );
  render();
}

function initReport() {
  const query = new URLSearchParams(location.search);
  let property = {
    ...(properties.find((p) => p.id === query.get("id")) || properties[0]),
  };
  const custom = query.get("custom") === "1";
  const userProvided = custom || query.has("name");
  const draft = readStorage("draft", null);
  if (
    custom &&
    draft &&
    typeof draft === "object" &&
    typeof draft.name === "string" &&
    Number.isFinite(draft.price) &&
    Number.isFinite(draft.area) &&
    draft.area > 0
  )
    property = { ...property, ...draft, id: "custom", short: draft.name };
  if (query.get("name"))
    property.name = property.short = query.get("name").slice(0, 100);
  if (query.get("zone")) property.location = query.get("zone").slice(0, 100);
  if (Number(query.get("area")) > 0 && Number(query.get("area")) <= 10000)
    property.area = Number(query.get("area"));
  if (!custom && query.has("name")) property.id = "shared";
  const base = {
    price: property.price,
    rent: property.rent,
    finance:
      custom && Number.isFinite(property.finance) ? property.finance : 80,
    interest:
      custom && Number.isFinite(property.interest) ? property.interest : 3.2,
    renovation:
      custom && Number.isFinite(property.renovation) ? property.renovation : 0,
  };
  const keys = ["price", "rent", "finance", "interest", "renovation"];
  const limits = {
    price: [1000, 10000000],
    rent: [0, 20000],
    finance: [0, 90],
    interest: [0, 15],
    renovation: [0, 500000],
  };
  const stored = readStorage(`scenario:${property.id}`, {});
  let scenario = { ...base };
  for (const key of keys) {
    const raw = query.has(key) ? query.get(key) : stored?.[key];
    if (raw === null && key === "rent") {
      scenario[key] = null;
      continue;
    }
    if (
      raw !== undefined &&
      raw !== null &&
      raw !== "" &&
      Number.isFinite(Number(raw)) &&
      Number(raw) >= limits[key][0] &&
      Number(raw) <= limits[key][1]
    )
      scenario[key] = Number(raw);
  }
  if (query.get("rent") === "unknown") scenario.rent = null;
  document.title = `${property.short} · Informe · FincaLens`;
  $("#report-title").textContent = property.name;
  $("#report-location").textContent = property.location;
  $("#report-facts").textContent =
    `${property.area} m² construidos · ${userProvided ? "Datos aportados por el usuario" : `${property.beds} hab. · ${property.baths} baño${property.baths > 1 ? "s" : ""}`}`;
  $("#aside-property-title").textContent = property.short;
  $("#aside-property-location").textContent = property.location;
  $("#aside-area").textContent = `${property.area} m²`;
  $("#aside-beds").textContent = userProvided
    ? "No informado"
    : `${property.beds} dormitorios`;
  $("#report-thumb").src = photo(property.image, 160);
  const priceRange = $("#price-range");
  priceRange.min = Math.max(1000, Math.floor((base.price * 0.65) / 100) * 100);
  priceRange.max = Math.ceil((base.price * 1.3) / 100) * 100;
  $("#price-min-label").textContent = euro(Number(priceRange.min));
  $("#price-max-label").textContent = euro(Number(priceRange.max));
  $("#rent-range").max = Math.max(2500, Math.ceil((base.rent || 1000) * 1.8));
  $("#rent-max-label").textContent = euro(Number($("#rent-range").max));
  if (userProvided) {
    $("#report-pros").innerHTML =
      "<li>Precio y superficie aportados para este escenario.</li><li>Los supuestos financieros se pueden ajustar.</li><li>Los resultados se calculan en este navegador.</li>";
    $("#report-cons").innerHTML =
      "<li>No se ha consultado el anuncio ni una fuente de mercado.</li><li>No se han verificado restricciones o disponibilidad de hipoteca.</li><li>Confirmar estado, gastos y documentación antes de decidir.</li>";
    $(".report-disclaimer").textContent =
      "Cálculo orientativo con datos aportados por el usuario y supuestos ilustrativos. No es una tasación ni asesoramiento financiero.";
    $("#valuation-title").nextElementSibling.textContent = "Datos aportados";
    $("#aside-beds")
      .closest(".aside-facts")
      .lastElementChild.querySelector("strong").textContent =
      "Aportado por el usuario";
  }
  function syncControls() {
    for (const key of keys) {
      $(`#${key}-input`).value = scenario[key] ?? "";
      const range = $(`#${key}-range`);
      if (scenario[key] !== null) {
        range.min = Math.min(Number(range.min), scenario[key]);
        range.max = Math.max(Number(range.max), scenario[key]);
        range.value = scenario[key];
      }
      range.disabled = scenario[key] === null;
    }
    $("#price-min-label").textContent = euro(Number(priceRange.min));
    $("#price-max-label").textContent = euro(Number(priceRange.max));
    $("#rent-max-label").textContent = euro(Number($("#rent-range").max));
  }
  const set = (selector, text) => ($(selector).textContent = text);
  function render() {
    const m = calculate(scenario);
    set("#hero-price", euro(scenario.price));
    set("#hero-yield", percent(m.netYield));
    set("#hero-cf", euro(m.cf, true));
    $("#hero-cf").style.color =
      m.cf === null ? "#a1afa5" : m.cf >= 0 ? "var(--lime)" : "#efb4a1";
    set("#report-score", m.score ?? "—");
    $("#score-ring").setAttribute(
      "aria-label",
      m.score === null
        ? "Puntuación no disponible: falta alquiler"
        : `Puntuación ilustrativa ${m.score} sobre 100`,
    );
    $("#score-progress").style.strokeDashoffset =
      276.46 * (1 - (m.score || 0) / 100);
    $("#score-progress").style.stroke =
      m.cf !== null && m.cf < 0 ? "#e5ae82" : "var(--lime)";
    set(
      "#verdict-title",
      m.cf === null
        ? "Falta una pieza importante."
        : m.cf < 0
          ? "El margen necesita otra mirada."
          : m.cf < 150
            ? "Hay margen. Conviene afinar."
            : "Los números encajan. Revisa los detalles.",
    );
    const origin = userProvided
      ? "el alquiler aportado"
      : "un alquiler ficticio";
    set(
      "#verdict-description",
      m.cf === null
        ? "Introduce un alquiler de referencia para calcular la rentabilidad y el flujo mensual. No hemos estimado una renta de mercado."
        : `Con ${origin}, ${m.cf >= 0 ? `el escenario deja ${euro(m.cf)} al mes` : `aportarías ${euro(-m.cf)} al mes`}, después de los gastos y la cuota previstos. Contrasta los datos antes de avanzar.`,
    );
    if (!userProvided) {
      $("#report-pros").innerHTML =
        `<li>Ejemplo de ${property.beds} dormitorios y ${property.area} m² construidos.</li><li>${m.cf === null ? "El precio permite explorar el capital inicial necesario." : m.cf >= 0 ? "El escenario actual genera un flujo mensual no negativo." : "El simulador permite explorar alternativas de financiación."}</li><li>Precio y gastos desglosados para comparar supuestos.</li>`;
    }
    set("#result-capital", euro(m.capital));
    set("#result-mortgage", `${euro(m.mortgage)}/mes`);
    set("#result-coc", percent(m.coc));
    $("#result-coc").className = m.coc !== null && m.coc < 0 ? "red" : "green";
    set("#aside-price-m2", `${euro(scenario.price / property.area)}/m²`);
    for (const [id, value] of [
      ["entry", m.entry],
      ["tax", m.tax],
      ["notary", m.notary],
      ["valuation", m.valuation],
      ["renovation", scenario.renovation],
      ["capital", m.capital],
      ["total", m.total],
    ])
      set(`#cost-${id}`, euro(value));
    const dirty = keys.some((key) => scenario[key] !== base[key]);
    $("#scenario-dirty").hidden = !dirty;
    const interestRows = [2, 3.2, 4, 5].map((rate) => {
      const payment = mortgagePayment(m.loan, rate);
      return {
        rate,
        payment,
        cf: scenario.rent === null ? null : scenario.rent * 0.85 - payment,
      };
    });
    $("#sensitivity-body").innerHTML =
      m.loan === 0
        ? '<tr><td colspan="3">Compra al contado: no hay cuota hipotecaria.</td></tr>'
        : interestRows
            .map(
              (row) =>
                `<tr><td>${percent(row.rate)}</td><td>${euro(row.payment)}</td><td class="${row.cf !== null && row.cf < 0 ? "red" : "green"}">${euro(row.cf, true)}</td></tr>`,
            )
            .join("");
    $("#sensitivity-chart").hidden = m.loan === 0 || scenario.rent === null;
    const max = Math.max(1, ...interestRows.map((r) => Math.abs(r.cf ?? 0)));
    $("#sensitivity-chart").innerHTML = interestRows
      .map(
        (row) =>
          `<div class="chart-bar-wrap"><div class="chart-bar ${row.cf < 0 ? "negative" : row.rate === 3.2 ? "current" : ""}" style="height:${Math.max(12, (Math.abs(row.cf ?? 0) / max) * 78)}%"><span class="chart-value">${euro(row.cf, true)}</span></div><span class="chart-label">${percent(row.rate)}</span></div>`,
      )
      .join("");
    set(
      "#print-context",
      `Escenario actual · Precio ${euro(scenario.price)} · Alquiler ${euro(scenario.rent)}/mes · Financiación ${percent(scenario.finance)} · Interés ${percent(scenario.interest)} · Reforma ${euro(scenario.renovation)} · Plazo 30 años · Gastos 15 % · Impuesto ilustrativo 6 %.`,
    );
  }
  function persist() {
    writeStorage(`scenario:${property.id}`, scenario);
  }
  for (const key of keys) {
    const input = $(`#${key}-input`),
      range = $(`#${key}-range`);
    input.addEventListener("input", () => {
      if (input.value === "" && key === "rent") scenario.rent = null;
      else if (input.value === "" || !input.validity.valid) return;
      else scenario[key] = Number(input.value);
      range.disabled = scenario[key] === null;
      if (scenario[key] !== null) {
        range.min = Math.min(Number(range.min), scenario[key]);
        range.max = Math.max(Number(range.max), scenario[key]);
        range.value = scenario[key];
      }
      document
        .querySelectorAll("[data-preset]")
        .forEach((b) => b.classList.remove("active"));
      render();
      persist();
    });
    input.addEventListener("change", () => {
      if (input.value === "" && key === "rent") scenario.rent = null;
      else if (!input.value || !input.reportValidity()) {
        syncControls();
        return;
      } else scenario[key] = Number(input.value);
      document
        .querySelectorAll("[data-preset]")
        .forEach((b) => b.classList.remove("active"));
      syncControls();
      render();
      persist();
    });
    range.addEventListener("input", () => {
      scenario[key] = Number(range.value);
      input.value = range.value;
      document
        .querySelectorAll("[data-preset]")
        .forEach((b) => b.classList.remove("active"));
      render();
    });
    range.addEventListener("change", persist);
  }
  function reset() {
    scenario = { ...base };
    syncControls();
    render();
    persist();
    document
      .querySelectorAll("[data-preset]")
      .forEach((b) =>
        b.classList.toggle("active", b.dataset.preset === "base"),
      );
  }
  $("#reset-scenario").addEventListener("click", reset);
  document.querySelectorAll("[data-preset]").forEach((button) =>
    button.addEventListener("click", () => {
      const mode = button.dataset.preset;
      scenario = { ...base };
      if (mode === "optimistic")
        Object.assign(scenario, {
          price: Math.round(base.price * 0.95),
          rent: base.rent === null ? null : Math.round(base.rent * 1.1),
          interest: Math.max(0, base.interest - 0.3),
          renovation: Math.round(base.renovation * 0.85),
        });
      if (mode === "conservative")
        Object.assign(scenario, {
          rent: base.rent === null ? null : Math.round(base.rent * 0.9),
          interest: Math.min(15, base.interest + 0.5),
          renovation: Math.round(base.renovation * 1.2),
        });
      document
        .querySelectorAll("[data-preset]")
        .forEach((b) => b.classList.toggle("active", b === button));
      syncControls();
      render();
      persist();
    }),
  );
  const checklistKey = `checklist:${property.id}`,
    checks = readStorage(checklistKey, {});
  function updateChecks() {
    const boxes = [...document.querySelectorAll("[data-check]")];
    const count = boxes.filter((b) => b.checked).length;
    set("#checklist-count", `${count}/${boxes.length}`);
    $("#checklist-progress").style.width = `${(count / boxes.length) * 100}%`;
  }
  document.querySelectorAll("[data-check]").forEach((box) => {
    box.checked = !!checks?.[box.dataset.check];
    box.addEventListener("change", () => {
      const next = Object.fromEntries(
        [...document.querySelectorAll("[data-check]")].map((b) => [
          b.dataset.check,
          b.checked,
        ]),
      );
      writeStorage(checklistKey, next);
      updateChecks();
    });
  });
  updateChecks();
  function shareUrl() {
    const url = new URL("informe.html", location.href);
    url.searchParams.set("id", userProvided ? "mar" : property.id);
    keys.forEach((key) =>
      url.searchParams.set(key, scenario[key] ?? "unknown"),
    );
    if (custom || query.has("name")) {
      url.searchParams.set("name", property.name);
      url.searchParams.set("zone", property.location);
      url.searchParams.set("area", property.area);
    }
    return url.href;
  }
  const shareButton = $("#share-button");
  function closeShare() {
    $("#share-popover").hidden = true;
    shareButton.setAttribute("aria-expanded", "false");
  }
  shareButton.addEventListener("click", () => {
    const open = $("#share-popover").hidden;
    $("#share-popover").hidden = !open;
    shareButton.setAttribute("aria-expanded", String(open));
  });
  document.addEventListener("click", (event) => {
    if (!event.target.closest(".share-wrap")) closeShare();
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") closeShare();
  });
  $("#copy-report").addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(shareUrl());
      toast(
        "Enlace al escenario copiado. Funciona donde esté servido este prototipo.",
      );
    } catch {
      toast(
        "No se pudo copiar el enlace. Comprueba los permisos del navegador.",
      );
    }
    closeShare();
  });
  $("#email-report").addEventListener("click", () => {
    const url = shareUrl();
    location.href = `mailto:?subject=${encodeURIComponent(`FincaLens · ${property.short}`)}&body=${encodeURIComponent(`Escenario ilustrativo: ${url}`)}`;
    closeShare();
  });
  $("#print-report").addEventListener("click", () => {
    $("#method-details").open = true;
    window.print();
  });
  syncControls();
  render();
}

function initCompare() {
  let ids = ["mar", "olavide", "naranjos"];
  const selected = () => ids.map((id) => properties.find((p) => p.id === id));
  function render() {
    const items = selected();
    const values = items.map(metric);
    $("#compare-selectors").innerHTML = items
      .map(
        (p, index) =>
          `<article class="compare-selector ${values[index].score === Math.max(...values.map((m) => m.score ?? -1)) ? "featured" : ""}"><img src="${photo(p.image, 600)}" alt="Fotografía ilustrativa de vivienda"><label class="sr-only" for="compare-slot-${index}">Inmueble ${index + 1}</label><select id="compare-slot-${index}" data-slot="${index}">${properties.map((option) => `<option value="${option.id}" ${option.id === p.id ? "selected" : ""} ${ids.includes(option.id) && option.id !== p.id ? "disabled" : ""}>${option.short}</option>`).join("")}</select><small>${p.location}</small><strong class="compare-price">${euro(p.price)}</strong></article>`,
      )
      .join("");
    $("#compare-head").innerHTML =
      `<tr><th>Métrica</th>${items.map((p) => `<th>${p.short}</th>`).join("")}</tr>`;
    const rows = [
      ["group", "El inmueble"],
      ["Superficie construida", items.map((p) => p.area), (v) => `${v} m²`],
      [
        "Precio por m²",
        items.map((p) => p.price / p.area),
        (v) => `${euro(v)}/m²`,
        "min",
      ],
      ["group", "La inversión"],
      ["Capital inicial", values.map((m) => m.capital), euro, "min"],
      ["Inversión total", values.map((m) => m.total), euro],
      ["Cuota hipotecaria", values.map((m) => m.mortgage), euro],
      ["Alquiler supuesto", items.map((p) => p.rent), euro],
      ["group", "Los resultados"],
      ["Rentabilidad neta", values.map((m) => m.netYield), percent, "max"],
      [
        "Cash-flow mensual",
        values.map((m) => m.cf),
        (v) => euro(v, true),
        "max",
      ],
      ["Cash-on-cash", values.map((m) => m.coc), percent, "max"],
      [
        "Puntuación ilustrativa",
        values.map((m) => m.score),
        (v) => (v === null ? "Sin datos" : `${v}/100`),
        "max",
      ],
    ];
    $("#compare-body").innerHTML =
      rows
        .map((row) => {
          if (row[0] === "group")
            return `<tr class="group"><td colspan="4">${row[1]}</td></tr>`;
          const [name, data, format, bestMode] = row;
          const valid = data.filter((v) => v !== null);
          const best = valid.length
            ? bestMode === "min"
              ? Math.min(...valid)
              : Math.max(...valid)
            : null;
          return `<tr><td>${name}</td>${data.map((v) => `<td class="${bestMode && v !== null && v === best ? "best" : ""}">${format(v)}</td>`).join("")}</tr>`;
        })
        .join("") +
      `<tr><td>Explorar la operación</td>${items.map((p) => `<td><a class="text-link" href="informe.html?id=${p.id}">Ver informe ${icon("arrow-up-right", "icon-sm")}</a></td>`).join("")}</tr>`;
  }
  $("#compare-selectors").addEventListener("change", (event) => {
    if (event.target.dataset.slot !== undefined) {
      ids[Number(event.target.dataset.slot)] = event.target.value;
      render();
    }
  });
  $("#export-comparison").addEventListener("click", () =>
    downloadCSV("fincalens-comparacion-ejemplo.csv", [
      [
        "Inmueble",
        "Precio EUR",
        "Capital EUR",
        "Rentabilidad neta %",
        "Cash-flow EUR/mes",
        "Datos",
      ],
      ...selected().map((p) => {
        const m = metric(p);
        return [
          p.name,
          p.price,
          m.capital,
          m.netYield?.toFixed(2),
          m.cf?.toFixed(2),
          "Ejemplo ficticio",
        ];
      }),
    ]),
  );
  render();
}

function initAnalyze() {
  let step = 1;
  const form = $("#analysis-form");
  if (Number.isFinite(preferences.finance))
    $("#listing-finance").value = preferences.finance;
  if (Number.isFinite(preferences.interest))
    $("#listing-interest").value = preferences.interest;
  function go(next) {
    step = next;
    for (let i = 1; i <= 3; i++) {
      $(`#analysis-step-${i}`).hidden = i !== step;
      $(`#analysis-step-${i}`)
        .querySelectorAll("input")
        .forEach((input) => {
          input.disabled =
            i !== step ||
            (input.id === "listing-url" && $("#url-source").hidden);
        });
      $(`[data-step="${i}"]`).classList.toggle("active", i === step);
    }
    form.hidden = step === 3;
  }
  document.querySelectorAll("[data-source]").forEach((button) =>
    button.addEventListener("click", () => {
      const manual = button.dataset.source === "manual";
      $("#url-source").hidden = manual;
      $("#listing-url").disabled = manual;
      document.querySelectorAll("[data-source]").forEach((b) => {
        b.classList.toggle("active", b === button);
        b.setAttribute("aria-pressed", String(b === button));
      });
    }),
  );
  $("#load-example").addEventListener("click", () => {
    $("#listing-name").value = "Piso en Calle del Mar";
    $("#listing-city").value = "El Cabanyal · Valencia";
    $("#listing-price").value = 185000;
    $("#listing-area").value = 72;
    $("#listing-rent").value = 1100;
    toast("Ejemplo ficticio cargado. No se ha consultado Idealista.");
  });
  $("#next-step").addEventListener("click", () => {
    const fields = [
      ...$("#analysis-step-1").querySelectorAll("input[required]"),
    ];
    if (fields.every((input) => input.reportValidity())) go(2);
  });
  $("#previous-step").addEventListener("click", () => go(1));
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    if (step === 1) {
      $("#next-step").click();
      return;
    }
    if (!form.reportValidity()) return;
    const data = {
      name: $("#listing-name").value.trim(),
      location: $("#listing-city").value.trim(),
      price: Number($("#listing-price").value),
      area: Number($("#listing-area").value),
      rent: Number($("#listing-rent").value),
      finance: Number($("#listing-finance").value),
      interest: Number($("#listing-interest").value),
      renovation: Number($("#listing-renovation").value),
    };
    if (!data.name || !data.location) {
      go(1);
      toast("Introduce un nombre y una zona para el inmueble.");
      return;
    }
    try {
      calculate(data);
    } catch {
      toast("Revisa los supuestos numéricos.");
      return;
    }
    if (writeStorage("draft", data) && writeStorage("scenario:custom", data))
      go(3);
  });
  $("#new-analysis-again").addEventListener("click", () => {
    form.reset();
    go(1);
  });
  go(1);
}

function initExtension() {
  const button = $("#extension-save");
  function render() {
    const saved = favorites.includes("mar");
    button.innerHTML = `${icon("bookmark")}${saved ? "Guardado en favoritos" : "Guardar en favoritos"}`;
    button.setAttribute("aria-pressed", String(saved));
  }
  button.addEventListener("click", () => {
    favorites = favorites.includes("mar")
      ? favorites.filter((id) => id !== "mar")
      : [...favorites, "mar"];
    writeStorage("favorites", favorites);
    render();
    toast(
      favorites.includes("mar")
        ? "Ejemplo guardado en favoritos."
        : "Ejemplo retirado de favoritos.",
    );
  });
  render();
}

function initSettings() {
  const form = $("#settings-form");
  form.elements.workspace.value = workspaceName;
  if (Number.isFinite(preferences.finance))
    form.elements.finance.value = preferences.finance;
  if (Number.isFinite(preferences.interest))
    form.elements.interest.value = preferences.interest;
  form.elements.reducedMotion.checked = !!preferences.reducedMotion;
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    if (!form.reportValidity()) return;
    const workspace = form.elements.workspace.value.trim();
    if (!workspace) {
      toast("El nombre del espacio no puede estar vacío.");
      return;
    }
    const values = {
      workspace,
      finance: Number(form.elements.finance.value),
      interest: Number(form.elements.interest.value),
      reducedMotion: form.elements.reducedMotion.checked,
    };
    if (writeStorage("preferences", values)) {
      toast("Preferencias guardadas para tus próximos análisis.");
      $(".workspace-picker .grow").textContent = workspace;
      preferences = values;
    }
  });
}

try {
  ({
    portfolio: initPortfolio,
    report: initReport,
    compare: initCompare,
    analyze: initAnalyze,
    extension: initExtension,
    settings: initSettings,
  })[page]();
} catch (error) {
  console.error("FincaLens view failed", error);
  toast("No se pudo abrir esta vista. Prueba a recargar la página.");
}
