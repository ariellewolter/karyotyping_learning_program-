import { escapeHtml } from "./util.js?v=20261006j";

export function classLabView(classId, stepIndex) {
  const steps = classId === "fish" ? fishSteps() : karyotypeSteps();
  const index = clamp(stepIndex, steps.length);
  const step = steps[index];
  const back = index > 0 ? `#/class/${classId}/${index - 1}` : "";
  const next = index < steps.length - 1 ? `#/class/${classId}/${index + 1}` : "";
  return `
    <main class="picker class-lab">
      <p class="crumb"><a href="#/">Home</a> / ${classId === "fish" ? "FISH" : "Karyotyping"}</p>
      <p class="class-progress">${index + 1} of ${steps.length}</p>
      <article class="class-step">
        <h2>${escapeHtml(step.title)}</h2>
        ${step.picture || ""}
        ${step.body}
        <div class="controls">
          ${back ? `<a class="btn" href="${back}">Back</a>` : ""}
          ${step.work ? workLink(step.work, `#/class/${classId}/${index}`, next) : ""}
          ${!step.work && next ? `<a class="btn primary" href="${next}">Continue</a>` : ""}
        </div>
      </article>
    </main>`;
}

function karyotypeSteps() {
  return [
    {
      title: "This is one cell",
      body: `<p>These chromosomes came from a single cell that was dropped on a slide. Click the picture that is a karyotype.</p>
        <div class="class-picks">
          <button type="button" class="class-pick" data-class-pick="spread">
            ${picture(metaphaseDraw(), "Still scattered")}
          </button>
          <button type="button" class="class-pick" data-class-pick="arranged">
            ${picture(pairDraw(), "Arranged")}
          </button>
        </div>
        <p class="class-note" data-class-note></p>`,
    },
    {
      title: "Stop the cell while it divides",
      body: `<p data-class-prompt>Click the nucleus. Then add colcemid, which stops the cell in the middle of division.</p>
        ${cellFigure()}
        <div class="controls">
          <button type="button" class="btn" data-class-act="divide-cell">Add colcemid</button>
        </div>
        <p class="class-note" data-class-note></p>`,
    },
    {
      title: "Spread the chromosomes",
      body: `<p data-class-prompt>The chromosomes are still in a clump. Add a hypotonic solution so water enters the cell.</p>
        ${swellFigure()}
        <div class="controls">
          <button type="button" class="btn" data-class-act="swell">Add hypotonic solution</button>
        </div>
        <p class="class-note" data-class-note></p>`,
    },
    {
      title: "Drop the cells on the slide",
      body: `<p data-class-prompt>The chromosomes are still inside the cell. Drop it onto the glass.</p>
        ${dropFigure()}
        <div class="controls">
          <button type="button" class="btn" data-class-act="drop">Drop onto the slide</button>
        </div>
        <p class="class-note" data-class-note></p>`,
    },
    {
      title: "Stain the chromosomes",
      body: `<p data-class-prompt>This chromosome has no stripes yet. Add Giemsa, then click the pale pinch and a dark stripe.</p>
        ${bandFigure()}
        <div class="controls">
          <button type="button" class="btn" data-class-act="giemsa">Add Giemsa</button>
        </div>
        <p class="class-note" data-class-note></p>`,
    },
    {
      title: "Name the parts of one chromosome",
      picture: picture(bandedDraw(), "Chromosome 7"),
      body: `<p>The short arm is at the top. The centromere is the pinch. The long arm is below it.</p>
        <p>Name those parts on chromosome 7. When you finish, you come back to the next part of this lab.</p>`,
      work: { href: "#/lab/chromosome/anatomy/assembly-chr7-anatomy/learn", label: "Name the landmarks" },
    },
    {
      title: "Read one address",
      picture: picture(bandedDraw(), "Find the mark"),
      body: `<p>A band address is read from the outside in: chromosome, arm, region, band, then a sub-band if that band is split.</p>
        <p>The gold mark on chromosome 7 is the address you will name.</p>`,
      work: { href: "#/lab/chromosome/band_identification/assembly-chr7-bands/learn", label: "Name the marked band" },
    },
    {
      title: "Arrange a normal cell",
      picture: picture(pairDraw(), "Both copies together"),
      body: `<p>Put both copies of each chromosome in that chromosome's box. Chromosome 1 is the largest. The Y, when there is one, sits with the smallest chromosomes.</p>
        <p>This cell has no disease finding. You are learning the order.</p>`,
      work: { href: "#/lab/karyotype/karyotype_construction/normal-46xy/learn", label: "Arrange the karyotype" },
    },
    {
      title: "Continue in Casework",
      body: `<p>The cases are in Casework. Start with the guided example, then choose an independent case. Each independent case is the same kind of assignment.</p>
        <p><a class="btn primary" href="#/patients/karyotype">Open Karyotyping Casework</a></p>`,
    },
  ];
}

function fishSteps() {
  return [
    {
      title: "Show the nucleus",
      body: `<p data-class-prompt>The field is dark. Add DAPI so the nucleus can be seen.</p>
        ${dapiFigure()}
        <div class="controls">
          <button type="button" class="btn" data-class-act="add-dapi">Add DAPI</button>
        </div>
        <p class="class-note" data-class-note></p>`,
    },
    {
      title: "Add the probe",
      body: `<p data-class-prompt>Add a probe that matches chromosome 8. Then wash off whatever did not bind.</p>
        ${probeFigure()}
        <div class="controls">
          <button type="button" class="btn" data-class-act="add-probe">Add the probe</button>
          <button type="button" class="btn" data-class-act="wash" disabled>Wash the slide</button>
        </div>
        <p class="class-note" data-class-note></p>`,
    },
    {
      title: "Turn on both channels",
      body: `<p>Each button is one channel on the microscope. Turn on both.</p>
        ${channelFigure()}
        <div class="controls">
          <button type="button" class="btn" data-channel="dapi">DAPI channel</button>
          <button type="button" class="btn" data-channel="probe">Probe channel</button>
        </div>
        <p class="class-note" data-class-note></p>`,
    },
    {
      title: "Score these nuclei",
      picture: picture(fishDraw("merge"), "Your turn"),
      body: `<p>Count the green spots you can assign to one nucleus, and say whether that nucleus is scorable.</p>`,
      work: { href: "#/lab/fish/enumeration/fish-enum-cep8/learn", label: "Count the signals" },
    },
    {
      title: "Some fields cannot be scored",
      picture: picture(fishDraw("overlap"), "Overlap"),
      body: `<p>When two nuclear outlines overlap, a spot in the overlap could belong to either cell. Leave that field unscorable.</p>`,
      work: { href: "#/lab/fish/quality/fish-enum-cep8/learn", label: "Decide what you can score" },
    },
    {
      title: "Together or apart",
      picture: picture(fishDraw("split"), "Break-apart"),
      body: `<p>This probe paints both sides of one gene. If the colors stay together, that copy of the gene is intact. If they separate, the gene has split.</p>
        <p>The separated colors do not tell you which chromosome received the piece.</p>`,
      work: { href: "#/lab/fish/break-apart/fish-breakapart-7q22/learn", label: "Score the break-apart" },
    },
    {
      title: "Continue in Casework",
      body: `<p>The assays are in Casework. Start with the guided enumeration, then choose an independent case. Each independent case is the same kind of assignment.</p>
        <p><a class="btn primary" href="#/patients/fish">Open FISH Casework</a></p>`,
    },
  ];
}

export function bindClassLab(root) {
  const note = root.querySelector("[data-class-note]");
  const say = (text) => { if (note) note.textContent = text; };
  root.querySelectorAll("[data-class-pick]").forEach((el) => {
    el.addEventListener("click", () => {
      root.querySelectorAll("[data-class-pick]").forEach((other) => other.classList.toggle("is-chosen", other === el));
      const pick = el.getAttribute("data-class-pick");
      const lines = {
        arranged: "This is the karyotype. Both copies sit together, short arm up.",
        spread: "This is the metaphase. The cell was dropped on the slide, and the chromosomes are still scattered.",
      };
      say(lines[pick] || "");
    });
  });
  root.querySelectorAll("[data-class-act]").forEach((el) => {
    el.addEventListener("click", () => {
      const act = el.getAttribute("data-class-act");
      if (act === "nucleus") {
        const dividing = root.querySelector(".class-cell")?.classList.contains("is-dividing");
        say(dividing
          ? "Colcemid stopped the cell here. These are separate chromosomes, so you can count them."
          : "The chromosomes are unwound inside the nucleus, so there is nothing to count.");
      }
      if (act === "divide-cell") {
        const cell = root.querySelector(".class-cell");
        cell?.classList.add("is-dividing");
        const caption = root.querySelector("[data-class-caption]");
        if (caption) caption.textContent = "Stopped in division";
        const prompt = root.querySelector("[data-class-prompt]");
        if (prompt) prompt.textContent = "Colcemid stopped this cell in the middle of division. The chromosomes stay short enough to see.";
        el.textContent = "Colcemid added";
        el.disabled = true;
        say("The nucleus has opened. Each chromosome is condensed, so you can see them one by one.");
      }
      if (act === "swell") {
        root.querySelectorAll(".class-swell .chr").forEach((g) => {
          g.style.transform = `translate(${g.dataset.x}px, ${g.dataset.y}px)`;
        });
        setCaption(root, "Spread apart");
        setPrompt(root, "Water entered the cell. The chromosomes moved apart.");
        finishAct(el, "Hypotonic solution added");
        say("You can tell the chromosomes apart now. Next they are dropped onto a slide.");
      }
      if (act === "drop") {
        root.querySelector(".class-drop")?.classList.add("is-dropped");
        root.querySelectorAll(".class-drop .chr").forEach((g) => {
          g.style.transform = `translate(${g.dataset.x}px, ${g.dataset.y}px)`;
        });
        setCaption(root, "On the slide");
        setPrompt(root, "The cell broke open on the glass. The chromosomes stuck where they landed.");
        finishAct(el, "Dropped");
        say("This is the scattered cell from the first screen. It is not a karyotype yet.");
      }
      if (act === "giemsa") {
        root.querySelector(".class-bands")?.classList.add("is-stained");
        setCaption(root, "G-banded");
        setPrompt(root, "Giemsa stuck more strongly to some parts. Click the pale pinch, then a dark stripe.");
        finishAct(el, "Giemsa added");
        say("The dark stripes are where the stain bound more strongly.");
      }
      if (act === "add-dapi") {
        root.querySelector(".class-dapi")?.classList.add("is-stained");
        setCaption(root, "DAPI");
        setPrompt(root, "DAPI sticks to DNA and shows the nucleus. It is not the probe.");
        finishAct(el, "DAPI added");
        say("The blue color is the nucleus of a cell that is not dividing.");
      }
      if (act === "add-probe") {
        root.querySelector(".class-probe")?.classList.add("is-probed");
        const wash = root.querySelector("[data-class-act='wash']");
        if (wash) wash.disabled = false;
        setCaption(root, "Probe on the slide");
        finishAct(el, "Probe added");
        say("Some probe bound chromosome 8. The extra spots did not bind. Wash them off.");
      }
      if (act === "wash") {
        root.querySelector(".class-probe")?.classList.add("is-washed");
        setCaption(root, "After the wash");
        setPrompt(root, "Only probe that bound chromosome 8 is still visible.");
        finishAct(el, "Washed");
        say("Each remaining green spot is one copy of that target.");
      }
    });
  });
  root.querySelectorAll("[data-channel]").forEach((el) => {
    el.addEventListener("click", () => {
      const fig = root.querySelector(".class-scope");
      const channel = el.getAttribute("data-channel");
      el.classList.toggle("is-on");
      fig?.classList.toggle(channel === "dapi" ? "is-dapi" : "is-probe", el.classList.contains("is-on"));
      const dapi = fig?.classList.contains("is-dapi");
      const probe = fig?.classList.contains("is-probe");
      if (dapi && probe) say("Both channels are on. Two green spots inside one nucleus means two copies of that target.");
      else if (dapi) say("This channel is the nucleus. The probe is hidden.");
      else if (probe) say("This channel is the probe. The nucleus is hidden.");
      else say("Both channels are off.");
    });
  });
  const seen = new Set();
  root.querySelectorAll("[data-part]").forEach((el) => {
    el.addEventListener("click", () => {
      if (!root.querySelector(".class-bands")?.classList.contains("is-stained")) {
        say("The stripes are not there yet. Add Giemsa first.");
        return;
      }
      const part = el.getAttribute("data-part");
      seen.add(part);
      el.setAttribute("stroke", "#1f6b4a");
      el.setAttribute("stroke-width", "2");
      if (part === "cen") say("That pale pinch is the centromere.");
      else if (part === "band") say("That dark stripe is where the stain stuck more strongly.");
      else say("That is part of an arm. The pinch and the dark stripes are the landmarks.");
      if (seen.has("cen") && seen.has("band")) {
        say("Giemsa made the dark stripes. The pale pinch is the centromere. Size, that pinch, and the stripe pattern tell chromosome 1 from chromosome 2.");
      }
    });
  });
}

function cellFigure() {
  const rods = [[-30, -34, 8, 34, -18], [-6, -40, 7, 28, 12], [16, -30, 8, 36, 6], [34, -16, 6, 24, -12], [-26, 8, 7, 30, 14], [-2, 4, 8, 32, -6], [18, 12, 6, 24, 16], [34, 2, 6, 22, -8]];
  const bits = rods.map(([x, y, w, h, angle]) => `<g transform="translate(${110 + x} ${98 + y}) rotate(${angle})"><rect x="${-w / 2}" width="${w}" height="${h}" rx="3" fill="#6e6588"/></g>`).join("");
  return `
    <figure class="scope-frame class-figure class-cell">
      <svg viewBox="0 0 220 200" width="360" height="328">
        <rect width="220" height="200" fill="#f3efe6"/>
        <circle cx="110" cy="98" r="78" fill="#fffdf8" stroke="#b7ad9c" stroke-width="2"/>
        <g class="nucleus">
          <circle class="hit" data-class-act="nucleus" cx="110" cy="98" r="36" fill="#2a4a78"/>
          <ellipse cx="100" cy="90" rx="14" ry="8" fill="#3d6296" pointer-events="none"/>
          <ellipse cx="120" cy="106" rx="12" ry="7" fill="#3d6296" pointer-events="none"/>
          <ellipse cx="106" cy="112" rx="10" ry="5" fill="#1e3558" pointer-events="none"/>
        </g>
        <g class="condensed">${bits}</g>
      </svg>
      <figcaption data-class-caption>Resting</figcaption>
    </figure>`;
}

function setCaption(root, text) {
  const caption = root.querySelector("[data-class-caption]");
  if (caption) caption.textContent = text;
}

function setPrompt(root, text) {
  const prompt = root.querySelector("[data-class-prompt]");
  if (prompt) prompt.textContent = text;
}

function finishAct(el, label) {
  el.textContent = label;
  el.disabled = true;
}

function dropFigure() {
  const inner = [[92, 72], [104, 78], [112, 64], [120, 86], [96, 98], [108, 104], [122, 74], [100, 88]];
  const outer = [[28, 24], [58, 46], [92, 18], [132, 36], [168, 22], [40, 112], [96, 118], [150, 96]];
  const size = [[8, 32], [7, 26], [8, 36], [6, 22], [7, 28], [8, 30], [6, 22], [6, 20]];
  const bits = inner.map(([x, y], i) => {
    const [w, h] = size[i];
    const [sx, sy] = outer[i];
    return `<g class="chr" data-x="${sx}" data-y="${sy}" style="transform: translate(${x}px, ${y}px)"><rect width="${w}" height="${h}" rx="3" fill="#6e6588"/></g>`;
  }).join("");
  return `
    <figure class="scope-frame class-figure class-drop">
      <svg viewBox="0 0 220 200" width="360" height="328">
        <rect width="220" height="200" fill="#f3efe6"/>
        <circle class="membrane" cx="110" cy="98" r="72" fill="#fffdf8" stroke="#b7ad9c" stroke-width="2"/>
        ${bits}
      </svg>
      <figcaption data-class-caption>Still inside the cell</figcaption>
    </figure>`;
}

function dapiFigure() {
  return `
    <figure class="scope-frame class-figure class-fish class-dapi">
      <svg viewBox="0 0 160 150" width="280" height="262">
        <rect width="160" height="150" fill="#07111f"/>
        <g class="dapi-nucleus"><circle cx="80" cy="76" r="42" fill="#16325a"/></g>
      </svg>
      <figcaption data-class-caption>Dark field</figcaption>
    </figure>`;
}

function probeFigure() {
  const unbound = [[40, 40], [118, 36], [48, 112]];
  return `
    <figure class="scope-frame class-figure class-fish class-probe">
      <svg viewBox="0 0 160 150" width="280" height="262">
        <rect width="160" height="150" fill="#07111f"/>
        <g class="unbound">${unbound.map(([x, y]) => `<circle cx="${x}" cy="${y}" r="5" fill="#7dffb0"/>`).join("")}</g>
        <g class="bound"><circle cx="66" cy="68" r="6" fill="#3dcc6d"/><circle cx="96" cy="86" r="6" fill="#3dcc6d"/></g>
      </svg>
      <figcaption data-class-caption>Dark field</figcaption>
    </figure>`;
}

function channelFigure() {
  return `
    <figure class="scope-frame class-figure class-fish class-scope">
      <svg viewBox="0 0 160 150" width="280" height="262">
        <rect width="160" height="150" fill="#07111f"/>
        <g class="ch-dapi"><circle cx="80" cy="76" r="42" fill="#16325a"/></g>
        <g class="ch-probe"><circle cx="66" cy="68" r="6" fill="#3dcc6d"/><circle cx="96" cy="86" r="6" fill="#3dcc6d"/></g>
      </svg>
      <figcaption>Microscope</figcaption>
    </figure>`;
}

function swellFigure() {
  const clump = [[62, 48], [70, 54], [66, 42], [74, 60], [68, 50], [72, 58], [64, 56], [76, 46]];
  const spread = [[18, 18], [36, 36], [54, 12], [74, 28], [96, 16], [28, 78], [58, 82], [86, 74]];
  const size = [[8, 36], [7, 28], [8, 44], [7, 32], [6, 26], [7, 30], [8, 34], [6, 24]];
  const bits = clump.map(([x, y], i) => {
    const [w, h] = size[i];
    const [sx, sy] = spread[i];
    return `<g class="chr" data-x="${sx}" data-y="${sy}" style="transform: translate(${x}px, ${y}px)"><rect width="${w}" height="${h}" rx="3" fill="#c9c3d6"/></g>`;
  }).join("");
  return `
    <figure class="scope-frame class-figure class-swell">
      <svg viewBox="0 0 160 150" width="280" height="262"><rect width="160" height="150" fill="#f4f1ea"/>${bits}</svg>
      <figcaption data-class-caption>Still in a clump</figcaption>
    </figure>`;
}

function bandFigure() {
  return `
    <figure class="scope-frame class-figure class-bands">
      <svg viewBox="0 0 160 150" width="280" height="262">
        <rect width="160" height="150" fill="#f4f1ea"/>
        <rect class="hit" data-part="arm" x="68" y="16" width="24" height="118" rx="12" fill="#d8d3e6"/>
        <rect class="hit stain" data-part="band" x="70" y="30" width="20" height="14" fill="#6e6588"/>
        <rect class="hit stain" data-part="cen" x="70" y="62" width="20" height="16" rx="6" fill="#c4bdd4"/>
        <rect class="hit stain" data-part="band" x="70" y="96" width="20" height="22" fill="#3c3650"/>
      </svg>
      <figcaption data-class-caption>Unstained</figcaption>
    </figure>`;
}

function workLink(work, here, next) {
  return `<a class="btn primary" href="${work.href}" data-class-return="${here}" data-class-next="${next || here}">${escapeHtml(work.label)}</a>`;
}

function clamp(stepIndex, length) {
  const n = Number(stepIndex);
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.min(length - 1, Math.floor(n));
}

function picture(inner, caption) {
  return `
    <figure class="scope-frame class-figure">
      <svg viewBox="0 0 160 150" width="280" height="262">${inner}</svg>
      <figcaption>${escapeHtml(caption)}</figcaption>
    </figure>`;
}

function metaphaseDraw() {
  const bits = [[28, 30, 8, 36], [48, 48, 7, 28], [70, 24, 8, 44], [92, 40, 7, 32], [112, 28, 6, 26], [40, 78, 7, 30], [78, 84, 8, 34], [104, 76, 6, 24]];
  return `<rect width="160" height="150" fill="#f4f1ea"/>${bits.map(([x, y, w, h]) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="3" fill="#c9c3d6"/>`).join("")}`;
}

function bandedDraw() {
  return `<rect width="160" height="150" fill="#f4f1ea"/>
    <rect x="72" y="16" width="16" height="118" rx="8" fill="#d8d3e6"/>
    <rect x="74" y="28" width="12" height="10" fill="#6e6588"/>
    <rect x="74" y="70" width="12" height="12" rx="4" fill="#9a90b0"/>
    <rect x="74" y="96" width="12" height="16" fill="#3c3650"/>`;
}

function pairDraw() {
  const one = (x) => `<rect x="${x}" y="18" width="14" height="112" rx="7" fill="#d8d3e6"/><rect x="${x + 2}" y="68" width="10" height="10" rx="3" fill="#9a90b0"/>`;
  return `<rect width="160" height="150" fill="#f4f1ea"/>${one(58)}${one(88)}`;
}

function fishDraw(kind) {
  const night = `<rect width="160" height="150" fill="#07111f"/>`;
  const nucleus = `<circle cx="80" cy="76" r="42" fill="#16325a"/>`;
  const greens = `<circle cx="66" cy="68" r="6" fill="#3dcc6d"/><circle cx="96" cy="86" r="6" fill="#3dcc6d"/>`;
  if (kind === "dapi") return `${night}${nucleus}`;
  if (kind === "green") return `${night}${greens}`;
  if (kind === "overlap") {
    return `${night}<circle cx="68" cy="76" r="36" fill="#16325a"/><circle cx="98" cy="84" r="34" fill="#1d406e"/><circle cx="80" cy="78" r="5" fill="#3dcc6d"/>`;
  }
  if (kind === "split") {
    return `${night}${nucleus}<circle cx="62" cy="70" r="6" fill="#e24b4b"/><circle cx="78" cy="66" r="6" fill="#3dcc6d"/><circle cx="108" cy="96" r="6" fill="#e24b4b"/><circle cx="92" cy="102" r="6" fill="#3dcc6d"/>`;
  }
  return `${night}${nucleus}${greens}`;
}

