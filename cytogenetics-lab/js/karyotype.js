import { DENVER_GROUPS, GROUPS, GROUP_OF, SLOT_IDS, shuffle } from "./util.js";

export function constructionStepsFor(chromosomes) {
  const present = new Set((chromosomes || []).map((c) => String(c.identity)));
  return DENVER_GROUPS.map((g) => ({
    id: g.id,
    title: g.title,
    subtitle: g.subtitle,
    slots: g.candidates.filter((slot) => present.has(slot)),
  })).filter((g) => g.slots.length > 0);
}

export function moveChromosome(karyotype, chrId, destSlot) {
  const next = {
    ...karyotype,
    pool: karyotype.pool.filter((id) => id !== chrId),
    slots: Object.fromEntries(
      SLOT_IDS.map((slot) => [slot, (karyotype.slots[slot] || []).filter((id) => id !== chrId)])
    ),
    selectedId: null,
  };
  if (destSlot === "pool" || destSlot == null) {
    next.pool = [...next.pool, chrId];
  } else {
    next.slots[destSlot] = [...(next.slots[destSlot] || []), chrId];
  }
  return next;
}

export function sheetStepsFor(chromosomes) {
  const present = [...new Set((chromosomes || []).map((c) => String(c.identity)))];
  const order = [...Array.from({ length: 22 }, (_, i) => String(i + 1)), "X", "Y"];
  return [{
    id: "sheet",
    title: "Karyotype",
    subtitle: "Place each chromosome with its number",
    slots: order.filter((slot) => present.includes(slot)),
  }];
}

export function resetKaryotype(chromosomes, options = {}) {
  const steps = options.sheet ? sheetStepsFor(chromosomes) : constructionStepsFor(chromosomes);
  const pool = chromosomes.map((c) => c.id);
  const trayScope = options.sheet ? "all" : (options.trayScope || "group");
  return {
    pool,
    slots: Object.fromEntries(SLOT_IDS.map((id) => [id, []])),
    selectedId: null,
    checkAttempt: 0,
    lastGrade: null,
    activeStep: 0,
    steps,
    trayScope,
    trayOrder: initialTrayOrder(steps, pool, chromosomes, "reset", trayScope),
  };
}

function initialTrayOrder(steps, pool, chromosomes, seed, trayScope) {
  const byId = Object.fromEntries(chromosomes.map((c) => [c.id, c]));
  const order = {};
  for (const step of steps) {
    const allowed = new Set(step.slots);
    const ids = pool.filter((id) => allowed.has(byId[id]?.identity));
    order[step.id] = shuffle(ids, hashSeed(`${seed}-${step.id}`));
  }
  if (trayScope === "all") order.all = shuffle(pool.slice(), hashSeed(`${seed}-all`));
  return order;
}

function hashSeed(str) {
  let h = 2166136261;
  for (const ch of String(str)) {
    h ^= ch.charCodeAt(0);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function currentStep(karyotype, chromosomes) {
  const steps = karyotype.steps?.length ? karyotype.steps : constructionStepsFor(chromosomes || []);
  return steps[karyotype.activeStep || 0] || steps[0];
}

export function unplacedForStep(karyotype, chromosomes, step) {
  const allowed = new Set((step || currentStep(karyotype, chromosomes)).slots);
  const byId = Object.fromEntries(chromosomes.map((c) => [c.id, c]));
  return (karyotype.pool || []).filter((id) => allowed.has(byId[id]?.identity));
}

export function poolForCurrentStep(karyotype, chromosomes) {
  if (karyotype.trayScope === "all" && karyotype.steps?.[0]?.id !== "sheet") {
    const ids = karyotype.pool || [];
    const saved = karyotype.trayOrder?.all || [];
    const ranked = saved.filter((id) => ids.includes(id));
    for (const id of ids) {
      if (!ranked.includes(id)) ranked.push(id);
    }
    return ranked;
  }
  const step = currentStep(karyotype, chromosomes);
  const ids = unplacedForStep(karyotype, chromosomes, step);
  const saved = karyotype.trayOrder?.[step.id] || [];
  const ranked = saved.filter((id) => ids.includes(id));
  for (const id of ids) {
    if (!ranked.includes(id)) ranked.push(id);
  }
  return ranked;
}

export function reshuffleCurrentTray(karyotype, chromosomes) {
  if (karyotype.trayScope === "all" && karyotype.steps?.[0]?.id !== "sheet") {
    const ids = shuffle([...(karyotype.pool || [])], Date.now());
    return {
      ...karyotype,
      trayOrder: { ...(karyotype.trayOrder || {}), all: ids },
      selectedId: null,
    };
  }
  const step = currentStep(karyotype, chromosomes);
  const ids = shuffle(unplacedForStep(karyotype, chromosomes, step), Date.now());
  return {
    ...karyotype,
    trayOrder: { ...(karyotype.trayOrder || {}), [step.id]: ids },
    selectedId: null,
  };
}

export function resetCurrentGroup(karyotype, chromosomes) {
  const step = currentStep(karyotype, chromosomes);
  let next = karyotype;
  for (const slot of step.slots) {
    for (const id of [...(next.slots[slot] || [])]) {
      next = moveChromosome(next, id, "pool");
    }
  }
  next = {
    ...next,
    checkAttempt: 0,
    lastGrade: null,
    selectedId: null,
  };
  return reshuffleCurrentTray(next, chromosomes);
}

export function allAssigned(karyotype) {
  return (karyotype.pool || []).length === 0;
}

export function canAdvanceGroup(karyotype, chromosomes, caseData = {}) {
  const unplaced = unplacedForStep(karyotype, chromosomes);
  if (unplaced.length) return { ok: false, reason: "unplaced" };
  const requireCorrect = Boolean(
    caseData.construction?.require_correct_to_advance || caseData.require_correct_groups
  );
  if (requireCorrect) {
    const grade = gradeKaryotype(karyotype, chromosomes, currentStep(karyotype, chromosomes).slots);
    if (!grade.perfect) return { ok: false, reason: "incorrect" };
  }
  return { ok: true };
}

export function gradeKaryotype(karyotype, chromosomes, slotFilter = null) {
  const byId = Object.fromEntries(chromosomes.map((c) => [c.id, c]));
  const expectedCounts = {};
  for (const chr of chromosomes) {
    expectedCounts[chr.identity] = (expectedCounts[chr.identity] || 0) + 1;
  }
  for (const slot of SLOT_IDS) {
    if (expectedCounts[slot] == null) expectedCounts[slot] = 0;
  }

  const slotResults = {};
  const groupErrors = new Set();
  const withinGroupErrors = new Set();
  let wrongGroup = 0;
  let wrongNumber = 0;

  for (const slot of SLOT_IDS) {
    const ids = karyotype.slots[slot] || [];
    const identities = ids.map((id) => byId[id]?.identity).filter(Boolean);
    const expected = expectedCounts[slot] || 0;
    const correctHere = identities.filter((ident) => ident === slot).length;
    const extras = identities.filter((ident) => ident !== slot);
    for (const ident of extras) {
      if (GROUP_OF[ident] === GROUP_OF[slot]) {
        wrongNumber += 1;
        withinGroupErrors.add(GROUP_OF[slot]);
      } else {
        wrongGroup += 1;
        groupErrors.add(GROUP_OF[slot]);
        if (GROUP_OF[ident]) groupErrors.add(GROUP_OF[ident]);
      }
    }
    const ok = extras.length === 0 && correctHere === expected && identities.length === expected;
    slotResults[slot] = {
      ok,
      expected,
      placed: identities.length,
      correctHere,
      extras,
    };
  }

  const focus = slotFilter && slotFilter.length ? slotFilter : presentSlots(chromosomes);
  const focusSet = new Set(focus);
  const unplaced = chromosomes.filter((c) => focusSet.has(c.identity) && karyotype.pool.includes(c.id)).length;
  const correctSlots = focus.filter((slot) => slotResults[slot].ok).length;
  const slotDenom = focus.length || 1;
  const identityCorrect = chromosomes.filter(
    (c) => focusSet.has(c.identity) && (karyotype.slots[c.identity] || []).includes(c.id)
  ).length;
  const placedFocus = focus.reduce((n, slot) => n + (karyotype.slots[slot] || []).length, 0);
  const totalChromosomes = chromosomes.filter((c) => focusSet.has(c.identity)).length;

  const groupStatus = {};
  for (const [g, members] of Object.entries(GROUPS)) {
    const relevant = members.filter((slot) => expectedCounts[slot] > 0);
    groupStatus[g] = relevant.length ? relevant.every((slot) => slotResults[slot].ok) : true;
  }

  return {
    totalChromosomes,
    unplaced,
    placed: placedFocus,
    correctSlots,
    slotDenom,
    identityCorrect,
    wrongGroup,
    wrongNumber,
    groupErrors: [...groupErrors],
    withinGroupErrors: [...withinGroupErrors],
    groupStatus,
    slotResults,
    scope: slotFilter ? "group" : "full",
    perfect: unplaced === 0 && correctSlots === slotDenom,
  };
}

function presentSlots(chromosomes) {
  return [...new Set(chromosomes.map((c) => String(c.identity)))];
}

export function karyotypeFeedback(grade, attempt) {
  const unit = grade.scope === "group" ? "group" : "karyotype";
  if (grade.perfect) {
    return {
      tone: "ok",
      title: grade.scope === "group"
        ? "This group matches the expected assignments."
        : "Karyotype arrangement matches the expected assignments.",
      body: grade.scope === "group"
        ? "You may continue to the next group."
        : "Chromosome identities are in the correct numbered positions. Continue to the next part of the exercise.",
    };
  }
  if (attempt <= 1) {
    const bits = [];
    if (grade.unplaced) bits.push(`${grade.unplaced} chromosome${grade.unplaced === 1 ? "" : "s"} in this ${unit} remain unassigned.`);
    if (grade.wrongNumber) bits.push("At least one chromosome is in the correct group but the wrong pair number.");
    if (!bits.length) bits.push("The arrangement is not yet complete. Recheck relative length, centromere position, and banding.");
    return {
      tone: "review",
      title: "Not yet complete — identities are not revealed.",
      body: bits.join(" "),
    };
  }
  if (attempt === 2) {
    return {
      tone: "review",
      title: "Compare homologs within this set",
      body: "Look again at length, centromere index, and G-band pattern. Individual identities are not marked yet.",
    };
  }
  return {
    tone: "review",
    title: "Slot-level review",
    body: "Highlighted positions do not yet match the expected chromosome identity or count. The true identity of each cut-out is still not shown.",
    highlightSlots: true,
  };
}
