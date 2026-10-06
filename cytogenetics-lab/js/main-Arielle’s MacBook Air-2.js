import { loadActivityLinks, loadActivityPacks, loadCatalog, loadDiseases, loadTemplates, loadMaps, loadProbes } from "./cases.js?v=20261006c";
import { parseHash } from "./util.js";
import { patch, subscribe } from "./store.js?v=20261006d";
import { render } from "./ui.js?v=20261006e";

subscribe(render);

export async function boot() {
  window.addEventListener("hashchange", () => {
    patch({ route: parseHash() });
  });
  patch({
    route: parseHash(),
    instructor: localStorage.getItem("cyto.instructor") === "1",
  });
  try {
    const [catalog, templates, maps, probes, diseases, activityLinks] = await Promise.all([
      loadCatalog(),
      loadTemplates(),
      loadMaps(),
      loadProbes(),
      loadDiseases(),
      loadActivityLinks(),
    ]);
    const activityPacks = await loadActivityPacks(activityLinks, catalog);
    patch({ catalog, templates, maps, probes, diseases, activityLinks, activityPacks, loadError: null });
  } catch (err) {
    patch({ loadError: err.message || String(err) });
  }
}

boot().catch((err) => {
  const app = document.getElementById("app");
  if (app) {
    app.innerHTML = `<main class="panel error-panel"><h1>Unable to start</h1><p>${String(err.message || err)}</p></main>`;
  }
});
