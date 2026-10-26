/**
 * A proposed result the student has to reject or accept.
 * The proposal is derived from the teaching case. It is not a second answer key.
 */

import { seedFrom, shuffle } from "./util.js?v=20261025lib1";

export function proposedAudit(caseData) {
  const fish = caseData?.fish;
  if (fish?.assay_type === "break-apart") return breakApartAudit(caseData);
  return karyotypeAudit(caseData);
}

function karyotypeAudit(caseData) {
  const iscn = String(caseData?.expected_iscn || "");
  const types = caseData?.abnormality_type || [];
  const numerical = types.includes("trisomy") || types.includes("monosomy");
  const sex = caseData?.sex_chromosomes || "XX";
  let proposal = iscn;
  let answer = "agree";
  if (numerical) {
    proposal = `46,${sex}`;
    answer = "omitted";
  } else if (types.includes("deletion") || types.includes("duplication") || types.includes("inversion")) {
    const flipped = iscn.replace(/,(del|dup|inv)\(([^)]+)\)\(([pq])/, (match, kind, chromosome, arm) => `,${kind}(${chromosome})(${arm === "p" ? "q" : "p"}`);
    if (flipped !== iscn) {
      proposal = flipped;
      answer = "arm";
    }
  } else if (iscn) {
    const shifted = iscn.replace(/([pq](?:\d+)?)(\d)/, (match, head, digit) => `${head}${(Number(digit) + 1) % 10}`);
    if (shifted !== iscn) {
      proposal = shifted;
      answer = "band";
    }
  }
  const choices = [
    { id: "omitted", label: "The formula leaves out a whole chromosome that the cell contains, or includes one the cell does not." },
    { id: "arm", label: "The formula puts the change on the wrong chromosome arm." },
    { id: "band", label: "The breakpoint or the band address does not match the drawing." },
    { id: "agree", label: "The formula matches the cell." },
  ];
  return {
    id: answer,
    kind: "karyotype",
    prompt: "A proposed ISCN is shown with this cell. Decide whether it agrees with the chromosomes.",
    proposal,
    answer,
    choices: shuffle(choices, seedFrom(`${caseData?.case_id || "case"}-${proposal}`)),
    why: {
      omitted: "The written count and the gain or loss have to match the chromosomes in the cell.",
      arm: "The arm in the formula has to be the arm that changed in the drawing.",
      band: "The band address has to be the address of the breakpoint, not a neighboring band.",
      agree: "This proposed formula uses the same count, arm, and band as the teaching cell.",
    }[answer],
  };
}

function breakApartAudit(caseData) {
  const choices = [
    { id: "partner", label: "A break-apart result can show that one locus is rearranged. It does not name the partner gene." },
    { id: "named", label: "A split signal identifies the fusion partner." },
    { id: "agree", label: "The statement is what this assay can establish." },
  ];
  return {
    id: "partner",
    kind: "fish",
    prompt: "A proposed interpretation says: this break-apart pattern identifies the fusion partner.",
    proposal: "The split signal names the partner gene.",
    answer: "partner",
    choices: shuffle(choices, seedFrom(`${caseData?.case_id || "fish"}-break-apart`)),
    why: "Break-apart probes flank one locus. A split means that locus is rearranged. Naming the partner needs a different assay.",
  };
}
