import json
import unittest
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "src"))

from search.reference_database import (  # noqa: E402
    find_chromosome,
    find_disease,
    find_fusion,
    find_gene,
    find_iscn,
    get_fish_probes,
)


class SearchTests(unittest.TestCase):
    def test_down_syndrome_has_an_educational_formula(self):
        payload = find_disease("Down syndrome")
        self.assertEqual(payload["match"], "exact")
        formulas = [item["original"] for row in payload["results"] for item in row["iscn_examples"]]
        self.assertIn("47,XX,+21", formulas)

    def test_iscn_exact_match_is_not_a_diagnosis(self):
        payload = find_iscn("47, XY, +21")
        self.assertEqual(payload["match"], "exact")
        self.assertIn("not a clinical diagnosis", payload["disclaimer"])
        self.assertTrue(all(row["record_class"] == "educational" for row in payload["results"]))

    def test_philadelphia_formula_links_the_educational_fusion(self):
        payload = find_iscn("46,XY,t(9;22)(q34;q11.2)")
        self.assertEqual(payload["match"], "exact")
        names = [row["disease"]["preferred_name"] for row in payload["results"]]
        self.assertIn("Chronic myeloid leukemia", names)

    def test_band_search_returns_cri_du_chat_example(self):
        payload = find_chromosome("5p15.2")
        self.assertNotEqual(payload["match"], "none")
        bands = [row["bands"] for row in payload["results"]]
        self.assertTrue(any(band and "5p15.2" in band for band in bands))

    def test_gene_and_fusion(self):
        gene = find_gene("BCR")
        symbols = [row["symbol"] for row in gene["fusions"]]
        self.assertIn("BCR::ABL1", symbols)
        fusion = find_fusion("BCR::ABL1")
        self.assertEqual(fusion["match"], "exact")
        self.assertEqual(fusion["results"][0]["record_class"], "educational")

    def test_unknown_query_is_an_explicit_miss(self):
        payload = find_iscn("46,XY,t(1;2)(p11;q11)")
        self.assertEqual(payload["match"], "none")
        self.assertEqual(payload["results"], [])
        self.assertIn("No disease was inferred", payload["note"])

    def test_fish_patterns_belong_to_a_probe(self):
        disease = find_disease("Chronic myeloid leukemia")
        disease_id = next(row["disease_id"] for row in disease["results"] if row["preferred_name"] == "Chronic myeloid leukemia")
        probes = get_fish_probes(disease_id)
        self.assertEqual(len(probes), 1)
        self.assertEqual(probes[0]["strategy"], "dual-fusion")
        roles = {item["pattern_role"]: item["pattern"] for item in probes[0]["patterns"]}
        self.assertEqual(roles["normal"], "2R2G")
        self.assertEqual(roles["abnormal"], "1R1G2F")


if __name__ == "__main__":
    unittest.main()
