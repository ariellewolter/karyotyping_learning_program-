/**
 * Read-only interface for a future teaching-app caller.
 * This module is not imported by the teaching application.
 */
import { spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const queryScript = resolve(dirname(fileURLToPath(import.meta.url)), "query.py");

function callQuery(args) {
  const result = spawnSync("python3", [queryScript, ...args], { encoding: "utf8" });
  if (result.status !== 0) {
    throw new Error(result.stderr || "reference database query failed");
  }
  return JSON.parse(result.stdout);
}

export function findDisease(query) {
  return callQuery(["search", "disease", query]);
}

export function findISCN(query) {
  return callQuery(["search", "iscn", query]);
}

export function findChromosome(query) {
  return callQuery(["search", "chromosome", query]);
}

export function findGene(query) {
  return callQuery(["search", "gene", query]);
}

export function findFusion(query) {
  return callQuery(["search", "fusion", query]);
}

export function getDiseaseDetails(id) {
  return callQuery(["details", id]);
}

export function getAssociatedAbnormalities(id) {
  return callQuery(["abnormalities", id]);
}

export function getFISHProbes(id) {
  return callQuery(["fish", id]);
}

export const referenceDatabase = {
  findDisease,
  findISCN,
  findChromosome,
  findGene,
  findFusion,
  getDiseaseDetails,
  getAssociatedAbnormalities,
  getFISHProbes,
};
