const form = document.querySelector("#search-form");
const results = document.querySelector("#results");
const details = document.querySelector("#details");
const disclaimer = document.querySelector("#disclaimer");
const note = document.querySelector("#note");

function badge(value) {
  const label = value || "unavailable";
  return `<span class="badge ${label}">${label}</span>`;
}

function text(value) {
  return value || "Not available in this database";
}

function renderResults(payload) {
  disclaimer.hidden = false;
  disclaimer.textContent = payload.disclaimer;
  note.hidden = !payload.note;
  note.textContent = payload.note || "";
  const rows = [...(payload.results || [])];
  for (const fusion of payload.fusions || []) {
    rows.push({ ...fusion, preferred_name: fusion.symbol, match_class: "exact" });
  }
  if (!rows.length) {
    results.innerHTML = `<p>${badge("none")} No matching record.</p>`;
    return;
  }
  const body = rows.map((row, index) => {
    const name = row.preferred_name || row.original || row.symbol || row.abnormality_type || row.genes || "Record";
    const id = row.disease_id || (row.disease && row.disease.disease_id) || "";
    return `<tr>
      <td><button type="button" data-id="${id}" data-index="${index}">${name}</button></td>
      <td>${badge(row.match_class || payload.match)} ${badge(row.record_class)}</td>
      <td>${text(row.source || row.category)}</td>
    </tr>`;
  }).join("");
  results.innerHTML = `<table><thead><tr><th>Record</th><th>Class</th><th>Source</th></tr></thead><tbody>${body}</tbody></table>`;
  results.querySelectorAll("button[data-index]").forEach((button) => {
    button.addEventListener("click", () => showDetail(rows[Number(button.dataset.index)], button.dataset.id));
  });
}

function list(items, render) {
  if (!items || !items.length) return "<p>Not available in this database.</p>";
  return `<ul>${items.map(render).join("")}</ul>`;
}

async function showDetail(row, diseaseId) {
  if (!diseaseId) {
    details.innerHTML = `<h3>${row.symbol || row.abnormality_type || "Record"}</h3>
      <p>${badge(row.record_class)} ${badge(row.match_class)}</p>
      <p>${text(row.evidence_label || row.rearrangement || row.bands)}</p>
      <p>Source: ${text(row.source)}</p>`;
    return;
  }
  const payload = await fetch(`/api/disease?id=${encodeURIComponent(diseaseId)}`).then((response) => response.json());
  const item = payload.result;
  if (!item) {
    details.innerHTML = "<p>No disease record for this result.</p>";
    return;
  }
  details.innerHTML = `
    <h3>${item.preferred_name}</h3>
    <p>${badge(item.record_class)} ${text(item.category)}</p>
    <p>${text(item.description)}</p>
    <h3>Abnormalities</h3>
    ${list(item.abnormalities, (entry) => `<li>${badge(entry.match_class)} ${text(entry.abnormality_type)} ${text(entry.bands || entry.chromosomes)} — ${text(entry.evidence_strength)}</li>`)}
    <h3>ISCN examples</h3>
    ${list(item.iscn_examples, (entry) => `<li>${badge(entry.record_class)} ${entry.original}</li>`)}
    <h3>Gene fusions</h3>
    ${list(item.fusions, (entry) => `<li>${badge(entry.record_class)} ${entry.symbol}</li>`)}
    <h3>FISH probes</h3>
    ${list(item.fish_probes, (entry) => `<li>${badge(entry.record_class)} ${entry.probe_name}: ${(entry.patterns || []).map((pattern) => `${pattern.pattern_role} ${pattern.pattern}`).join("; ")}</li>`)}
    <h3>Sources</h3>
    <p>${item.source}: ${text(item.source_record)}</p>
    <p>Identifiers: ${item.identifiers.length ? item.identifiers.slice(0, 8).map((id) => `${id.system} ${id.code}`).join(", ") : "Not available in this database"}</p>`;
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const type = document.querySelector("#search-type").value;
  const query = document.querySelector("#search-query").value;
  const payload = await fetch(`/api/search?type=${encodeURIComponent(type)}&q=${encodeURIComponent(query)}`).then((response) => response.json());
  renderResults(payload);
  details.innerHTML = "<p>Select a result to see abnormalities, ISCN examples, fusions, and sources.</p>";
});

fetch("/api/provenance").then((response) => response.json()).then((payload) => {
  const lines = payload.sources.map((source) =>
    `${source.title}: ${source.record_count} records. ${source.retrieved ? `Retrieved ${source.retrieved}.` : "Not imported."} ${source.license_note}`);
  document.querySelector("#provenance").innerHTML = `<h2>Provenance</h2><p>${lines.join("</p><p>")}</p><p>${payload.disclaimer}</p>`;
});
