import { chromosomeTraits } from "./chromosomes.js?v=20261026p5";
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
    comparisonId: null,
    evidenceChoice: null,
    evidenceFeedback: null,
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

export function diseaseComparisonRounds(chromosomes, involved) {
  const present = new Set((chromosomes || []).map((chromosome) => String(chromosome.identity)));
  const counts = {};
  for (const chromosome of chromosomes || []) {
    const identity = String(chromosome.identity);
    counts[identity] = (counts[identity] || 0) + 1;
  }
  const involvedIds = [...new Set((involved || []).map(String))].filter((identity) => present.has(identity));
  const involvedSet = new Set(involvedIds);
  const landmarks = [["4", "5"], ["6", "7"], ["13", "14", "15"], ["9", "10"], ["1", "2"]]
    .find((group) => group.every((identity) => present.has(identity) && !involvedSet.has(identity) && counts[identity] === 2));
  const rounds = [];
  if (landmarks) {
    rounds.push({
      id: "normal-comparison",
      title: "Normal comparison",
      note: "Compare these chromosomes with each other. Small differences in bend or condensation are ordinary variation in the drawing. They are not an abnormality.",
      slots: landmarks,
    });
  }
  if (involvedIds.length) {
    const unusual = involvedIds.filter((identity) => counts[identity] !== 2);
    rounds.push({
      id: "find-difference",
      title: "Find what differs",
      note: unusual.length
        ? `Count chromosome ${unusual.join(" and ")}. A usual pair has two copies. The drawing does not name the finding.`
        : "Compare these homologs. Look for a difference in length, centromere position, or band order. The drawing does not name the finding.",
      slots: involvedIds,
    });
  }
  return rounds;
}

export function focusRoundsFromCase(caseData) {
  const rounds = Array.isArray(caseData?.learning_rounds) ? caseData.learning_rounds : [];
  return rounds.map((round, index) => {
    const slots = [...new Set((round?.slots || []).map(String))].filter((slot) => /^(?:[1-9]|1\d|2[0-2]|X|Y)$/.test(slot));
    return {
      id: String(round?.id || `round-${index + 1}`),
      title: String(round?.title || `Chromosomes ${slots.join(" and ")}`),
      note: String(round?.note || ""),
      slots,
    };
  }).filter((round) => round.slots.length);
}

export function startFocusRound(karyotype, chromosomes, rounds, index) {
  const round = rounds[index];
  const wanted = new Set(round.slots.map(String));
  let next = karyotype;
  for (const slot of Object.keys(next.slots || {})) {
    if (!wanted.has(String(slot))) continue;
    for (const id of [...(next.slots[slot] || [])]) next = moveChromosome(next, id, "pool");
  }
  return seatSingleCopies({
    ...next,
    selectedId: null,
    comparisonId: null,
    evidenceChoice: null,
    evidenceFeedback: null,
    checkAttempt: 0,
    lastGrade: null,
    placementMarks: false,
    activeStep: 0,
    focusSlots: round.slots,
    focusRounds: rounds,
    focusRoundIndex: index,
    steps: [{ id: round.id, title: round.title, subtitle: round.note || "Case focus", slots: round.slots }],
  }, chromosomes);
}

export function seatSingleCopies(karyotype, chromosomes) {
  const counts = {};
  for (const chromosome of chromosomes || []) {
    const identity = String(chromosome.identity);
    counts[identity] = (counts[identity] || 0) + 1;
  }
  const slots = (karyotype.focusSlots || []).map(String);
  let next = karyotype;
  for (const identity of slots) {
    if (counts[identity] !== 1) continue;
    for (const chromosome of chromosomes) {
      if (String(chromosome.identity) !== identity || !next.pool.includes(chromosome.id)) continue;
      next = moveChromosome(next, chromosome.id, identity);
    }
  }
  const byId = Object.fromEntries((chromosomes || []).map((chromosome) => [chromosome.id, chromosome]));
  const selectedId = next.pool.includes(next.selectedId)
    ? next.selectedId
    : next.pool.find((id) => {
      const identity = String(byId[id]?.identity);
      return slots.includes(identity) && counts[identity] > 1;
    }) || null;
  return { ...next, selectedId, comparisonId: null, evidenceChoice: null, evidenceFeedback: null };
}

export function resetKaryotype(chromosomes, options = {}) {
  const steps = options.sheet ? sheetStepsFor(chromosomes) : constructionStepsFor(chromosomes);
  const pool = chromosomes.map((c) => c.id);
  const trayScope = options.sheet ? "all" : (options.trayScope || "group");
  return {
    pool,
    slots: Object.fromEntries(SLOT_IDS.map((id) => [id, []])),
    selectedId: null,
    comparisonId: null,
    evidenceChoice: null,
    evidenceFeedback: null,
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
      comparisonId: null,
      evidenceChoice: null,
      evidenceFeedback: null,
    };
  }
  const step = currentStep(karyotype, chromosomes);
  const ids = shuffle(unplacedForStep(karyotype, chromosomes, step), Date.now());
  return {
    ...karyotype,
    trayOrder: { ...(karyotype.trayOrder || {}), [step.id]: ids },
    selectedId: null,
    comparisonId: null,
    evidenceChoice: null,
    evidenceFeedback: null,
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
    placementMarks: false,
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

function boxName(slot) {
  return slot === "X" || slot === "Y" ? `the ${slot} box` : `box ${slot}`;
}

function centromerePlace(cen) {
  if (cen >= 0.45) return "near the middle";
  if (cen >= 0.36) return "slightly above the middle";
  if (cen >= 0.3) return "well above the middle";
  return "close to the top";
}

function describeMismatch(slot, placed, expected, result) {
  const name = boxName(slot);
  if (!placed.length) {
    const n = result.expected;
    return `${name[0].toUpperCase()}${name.slice(1)} is empty. It takes ${n === 1 ? "one chromosome" : `${n} matching chromosomes`}.`;
  }
  const identities = [...new Set(placed.map((chr) => String(chr.identity)))];
  const bits = [];
  if (placed.length !== result.expected) {
    bits.push(result.expected === 1
      ? `${name[0].toUpperCase()}${name.slice(1)} holds ${placed.length} chromosomes. This cell has one chromosome for that box.`
      : `${name[0].toUpperCase()}${name.slice(1)} holds ${placed.length} chromosomes. That box takes ${result.expected}.`);
  }
  if (identities.length === 1 && identities[0] === slot && placed.length !== result.expected) {
    const missing = result.expected - placed.length;
    bits.push(placed.length < result.expected
      ? (result.expected === 1
        ? `${name[0].toUpperCase()}${name.slice(1)} takes the one copy in this cell.`
        : result.expected === 2
          ? "The chromosome already there matches the box. Its partner is in another box or still in the tray."
          : `The ${placed.length === 1 ? "chromosome" : "chromosomes"} already there ${placed.length === 1 ? "matches" : "match"} the box. ${missing === 1 ? "One more copy belongs" : `${missing} more copies belong`} in ${name}.`)
      : (result.expected === 2
        ? "An extra chromosome is in that box. The matching pair stays, and the extra one belongs somewhere else."
        : `${name[0].toUpperCase()}${name.slice(1)} has ${placed.length} chromosomes. This cell has ${result.expected}.`));
    return bits.join(" ");
  }
  if (identities.length > 1) {
    const cens = placed.map((chr) => chromosomeTraits(chr).cen).filter((cen) => Number.isFinite(cen));
    const low = Math.min(...cens);
    const high = Math.max(...cens);
    if (cens.length > 1 && high - low >= 0.04) {
      bits.push(`The chromosomes in ${name} are not a pair. One has the centromere ${centromerePlace(low)}, and the other has it ${centromerePlace(high)}.`);
    } else {
      bits.push(`The chromosomes in ${name} are not a matching pair. Compare the dark bands beside the centromere.`);
    }
    return bits.join(" ");
  }
  const placedCen = chromosomeTraits(placed[0]).cen;
  const expectedCen = expected ? chromosomeTraits(expected).cen : null;
  const placedLength = chromosomeTraits(placed[0]).relativeLength;
  const expectedLength = expected ? chromosomeTraits(expected).relativeLength : 0;
  const many = placed.length > 1;
  if (Number.isFinite(placedCen) && Number.isFinite(expectedCen) && Math.abs(placedCen - expectedCen) >= 0.035) {
    bits.push(`The chromosome${many ? "s" : ""} in ${name} ${many ? "have" : "has"} the centromere ${centromerePlace(placedCen)}. The chromosome that belongs there has the centromere ${centromerePlace(expectedCen)}.`);
  } else if (expected && Math.abs(placedLength - expectedLength) >= 0.12) {
    bits.push(placedLength < expectedLength
      ? `The chromosome${many ? "s" : ""} in ${name} ${many ? "are" : "is"} shorter than the one that belongs there. Its centromere should sit ${centromerePlace(expectedCen)}.`
      : `The chromosome${many ? "s" : ""} in ${name} ${many ? "are" : "is"} longer than the one that belongs there. Its centromere should sit ${centromerePlace(expectedCen)}.`);
  } else {
    bits.push(`Length will not separate the chromosome in ${name} from the one that belongs there. Compare the darkest band on the long arm.`);
  }
  return bits.join(" ");
}

function mismatchScore(placed, expected, result) {
  if (!placed.length) return 1;
  const identities = new Set(placed.map((chr) => String(chr.identity)));
  let score = 0;
  if (placed.length !== result.expected) score += 4;
  if (identities.size > 1) score += 6;
  if (expected && !identities.has(String(expected.identity))) {
    const diff = Math.abs(chromosomeTraits(placed[0]).cen - chromosomeTraits(expected).cen);
    score += 8 + (Number.isFinite(diff) ? diff * 20 : 0);
  }
  return score;
}

export function placementHint(karyotype, chromosomes, slotFilter) {
  const grade = gradeKaryotype(karyotype, chromosomes, slotFilter);
  const byId = Object.fromEntries(chromosomes.map((chr) => [chr.id, chr]));
  const focus = slotFilter?.length ? slotFilter : presentSlots(chromosomes);
  const placedAny = focus.some((slot) => (karyotype.slots[slot] || []).length);
  if (!placedAny) return null;
  if (grade.perfect) return slotFilter?.length
    ? "The chromosomes in this group are in the right boxes."
    : "Every chromosome is in the right box.";
  const wrong = focus.filter((slot) => !grade.slotResults[slot]?.ok);
  const ranked = wrong.map((slot) => {
    const placed = (karyotype.slots[slot] || []).map((id) => byId[id]).filter(Boolean);
    const expected = chromosomes.find((chr) => String(chr.identity) === String(slot)) || null;
    return { slot, placed, expected, result: grade.slotResults[slot], score: mismatchScore(placed, expected, grade.slotResults[slot]) };
  }).sort((a, b) => b.score - a.score);
  const sentences = [];
  const correct = focus.filter((slot) => grade.slotResults[slot]?.ok && grade.slotResults[slot].placed > 0);
  if (correct.length) sentences.push("The green boxes are correct.");
  if (ranked[0]) sentences.push(describeMismatch(ranked[0].slot, ranked[0].placed, ranked[0].expected, ranked[0].result));
  if (wrong.length > 1) sentences.push("The other boxes without a green background still need another look.");
  if (grade.unplaced) sentences.push(`${grade.unplaced} chromosome${grade.unplaced === 1 ? " is" : "s are"} still in the tray.`);
  return sentences.join(" ");
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
    if (grade.unplaced) bits.push(`${grade.unplaced} chromosome${grade.unplaced === 1 ? "" : "s"} ${unit === "group" ? "in this group are" : "are"} still in the tray.`);
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
