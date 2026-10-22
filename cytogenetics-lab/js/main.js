import { enrichCatalog, loadActivityLinks, loadActivityPacks, loadCatalog, loadDiseases, loadTemplates, loadMaps, loadProbes } from "./cases.js?v=20261015a";
import { bindChromosomeMaps } from "./chromosomes.js?v=20261015a";
import { parseHash } from "./util.js?v=20261006j";
import { patch, subscribe } from "./store.js?v=20261006j";
import { render } from "./ui.js?v=20261015a";

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
    const [catalogIndex, templates, maps, probes, diseases, activityLinks] = await Promise.all([
      loadCatalog(),
      loadTemplates(),
      loadMaps(),
      loadProbes(),
      loadDiseases(),
      loadActivityLinks(),
    ]);
    const catalog = await enrichCatalog(catalogIndex);
    const activityPacks = await loadActivityPacks(activityLinks, catalog);
    bindChromosomeMaps(maps);
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
