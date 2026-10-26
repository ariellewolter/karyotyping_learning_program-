import { iscnComponentLabels } from "./iscn.js";

export function summarizeSession(session) {
  const rows = [];
  const s = session.scores || {};
  if (s.karyotype_construction) {
    const g = s.karyotype_construction;
    rows.push({
      skill: "Karyotype construction",
      result: g.perfect ? "correct" : `${g.correctSlots}/${g.slotDenom} positions correct`,
      detail: g.unplaced ? `${g.unplaced} unassigned` : "",
    });
  }
  if (s.chromosome_identification) {
    const g = s.chromosome_identification;
    rows.push({
      skill: "Chromosome identification",
      result: `${g.identityCorrect}/${g.totalChromosomes} assigned to the matching number`,
      detail: g.wrongGroup ? "group errors present" : g.wrongNumber ? "within-group swaps present" : "",
    });
  }
  if (s.abnormality_recognition) {
    rows.push({
      skill: "Abnormality recognition",
      result: s.abnormality_recognition.ok ? "correct" : "needs review",
      detail: s.abnormality_recognition.detail || "",
    });
  }
  if (s.change_identification) {
    rows.push({
      skill: "Identify the change",
      result: s.change_identification.ok ? "correct" : "needs review",
      detail: "",
    });
  }
  if (s.iscn_interpretation) {
    const c = s.iscn_interpretation.components || {};
    for (const [key, label] of Object.entries(iscnComponentLabels())) {
      if (!c[key] || c[key] === "na") continue;
      rows.push({
        skill: `ISCN interpretation — ${label.toLowerCase()}`,
        result: statusWord(c[key]),
        detail: "",
      });
    }
  }
  if (s.iscn_construction) {
    const c = s.iscn_construction.components || {};
    rows.push({
      skill: "ISCN chromosome count",
      result: statusWord(c.chromosome_count),
      detail: "",
    });
    rows.push({
      skill: "ISCN sex complement",
      result: statusWord(c.sex_chromosomes),
      detail: "",
    });
    rows.push({
      skill: "ISCN abnormality notation",
      result: statusWord(c.abnormality),
      detail: "",
    });
    if (c.chromosomes_involved && c.chromosomes_involved !== "na") {
      rows.push({
        skill: "ISCN chromosome(s) involved",
        result: statusWord(c.chromosomes_involved),
        detail: "",
      });
    }
  }
  if (s.disease_association) {
    rows.push({
      skill: s.disease_association.detail === "finding" ? "Match the finding" : "Disease association",
      result: s.disease_association.ok ? "correct" : "needs review",
      detail: "",
    });
  }
  if (s.chromosome_assembly) {
    const g = s.chromosome_assembly;
    rows.push({
      skill: "Chromosome assembly",
      result: g.perfect ? "correct" : "needs review",
      detail: `orientation ${g.orientation}; order ${g.segment_order}`,
    });
  }
  if (s.banding_nomenclature) {
    const c = s.banding_nomenclature.components || {};
    rows.push({
      skill: "Band nomenclature",
      result: s.banding_nomenclature.match ? "correct" : "needs review",
      detail: Object.entries(c).filter(([, v]) => v && v !== "na").map(([k, v]) => `${k}: ${v}`).join("; "),
    });
  }
  if (s.fish_localization) {
    rows.push({
      skill: "FISH probe localization",
      result: s.fish_localization.match ? "correct" : "needs review",
      detail: "",
    });
  }
  if (s.fish_probe_type) {
    rows.push({
      skill: "FISH probe-type recognition",
      result: s.fish_probe_type.match ? "correct" : "needs review",
      detail: "",
    });
  }
  if (s.fish_signals) {
    const g = s.fish_signals;
    rows.push({
      skill: "FISH signal identification",
      result: `${g.identified}/${g.expected} identified`,
      detail: `classification ${g.classified}/${g.expected}`,
    });
  }
  if (s.fish_quality) {
    rows.push({
      skill: "FISH scorable nuclei",
      result: `${s.fish_quality.ok}/${s.fish_quality.n}`,
      detail: "",
    });
  }
  if (s.fish_field) {
    rows.push({
      skill: "FISH field scoring",
      result: `${s.fish_field.ok}/${s.fish_field.n} nuclei`,
      detail: `${s.fish_field.technical ? `technical scoring ${s.fish_field.technical[0]}/${s.fish_field.technical[1]}; ` : ""}signal counts differ on ${s.fish_field.signalRecognition ?? 0} scored nuclei, scorable nuclei excluded ${s.fish_field.inappropriateExclusion ?? 0}, unscorable nuclei scored ${s.fish_field.missedExclusion ?? 0}, correct exclusions with a different reason ${s.fish_field.reasonMismatch ?? 0}`,
    });
  }
  if (s.fish_counts) {
    rows.push({
      skill: "FISH signal counting",
      result: `${s.fish_counts.ok}/${s.fish_counts.n} nuclei`,
      detail: "",
    });
  }
  if (s.fish_strategy) {
    rows.push({
      skill: "FISH probe-strategy selection",
      result: s.fish_strategy.ok ? "correct" : "needs review",
      detail: "",
    });
  }
  if (s.fish_interpretation) {
    rows.push({
      skill: "FISH cytogenetic interpretation",
      result: s.fish_interpretation.ok ? "correct" : "needs review",
      detail: s.fish_interpretation.detail || "",
    });
  }
  return rows;
}

function statusWord(value) {
  if (value === "correct") return "correct";
  if (value === "missing") return "not provided";
  if (value === "na") return "not applicable";
  return "needs review";
}

export function attemptSummary(session) {
  const a = session.attempts || {};
  return {
    hintsUsed: session.hintsUsed || 0,
    karyotypeChecks: a.karyotype || 0,
    abnormalityAttempts: a.abnormality || 0,
    iscnAttempts: (a.iscn_construction || 0) + (a.iscn_interpretation || 0),
    diseaseAttempts: a.disease || 0,
  };
}
