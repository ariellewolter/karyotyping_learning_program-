import json
import unittest
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "src"))

from interpretation.coverage import build_coverage  # noqa: E402
from interpretation.engine import disease_record, interpret_iscn, load_teaching_index  # noqa: E402


class InterpretationTests(unittest.TestCase):
    def test_normal_karyotypes_have_no_disease(self):
        for formula in ("46,XX", "46,XY"):
            report = interpret_iscn(formula)
            self.assertEqual(report["status"], "complete")
            self.assertEqual(report["lines"][0]["events"], [])
            self.assertTrue(report["visualization"])
            self.assertEqual(report["associations"]["match"], "none")
            self.assertIn("No stored disease", report["associations"]["note"])

    def test_numerical_and_sex_chromosome_examples(self):
        down = interpret_iscn("47,XY,+21")
        self.assertEqual(down["status"], "complete")
        self.assertEqual(down["lines"][0]["events"][0]["type"], "gain")
        self.assertEqual(down["lines"][0]["sex"]["written"], "XY")
        self.assertEqual(down["associations"]["match"], "exact")
        self.assertTrue(any(row["disease"]["preferred_name"] == "Down syndrome" for row in down["associations"]["exact"]))
        turner = interpret_iscn("45,X")
        self.assertEqual(turner["lines"][0]["sex"]["x"], 1)
        self.assertEqual(turner["lines"][0]["count_expected"], 45)
        klinefelter = interpret_iscn("47,XXY")
        self.assertEqual(klinefelter["status"], "complete")
        self.assertEqual(klinefelter["lines"][0]["sex"]["x"], 2)
        self.assertEqual(klinefelter["lines"][0]["sex"]["y"], 1)

    def test_structural_rearrangements_and_multiple_events(self):
        philadelphia = interpret_iscn("46,XY,t(9;22)(q34;q11.2)")
        self.assertEqual(philadelphia["lines"][0]["events"][0]["kind"], "translocation")
        self.assertEqual(philadelphia["lines"][0]["events"][0]["geometry"]["shape"], "two derivatives")
        self.assertIn("BCR::ABL1", [item["symbol"] for item in philadelphia["fusions"]])
        deletion = interpret_iscn("46,XX,del(5)(p15.2)")
        self.assertEqual(deletion["lines"][0]["events"][0]["geometry"]["shape"], "shortened")
        self.assertGreater(len(deletion["associations"]["structural"]), 1)
        inversion = interpret_iscn("46,XX,inv(9)(p12q13)")
        self.assertEqual(inversion["lines"][0]["events"][0]["geometry"]["shape"], "reversed segment")
        both = interpret_iscn("48,XX,+21,+18")
        self.assertEqual(both["status"], "complete")
        self.assertEqual([item["chromosomes"][0] for item in both["lines"][0]["events"]], ["21", "18"])

    def test_unsupported_and_ambiguous_syntax_is_not_drawn(self):
        added = interpret_iscn("46,XX,add(1)(q21)")
        self.assertEqual(added["status"], "partial")
        self.assertFalse(added["visualization"])
        self.assertFalse(added["lines"][0]["events"][0]["geometry"]["drawable"])
        ambiguous = interpret_iscn("46,XY,t(9;22)")
        self.assertEqual(ambiguous["status"], "partial")
        self.assertEqual(ambiguous["fusions"], [])
        self.assertEqual(ambiguous["fish_probes"], [])
        self.assertFalse(ambiguous["visualization"])
        unknown = interpret_iscn("46,XY,idem")
        self.assertEqual(unknown["status"], "partial")
        self.assertIn("not expanded", unknown["lines"][0]["events"][0]["reason"])

    def test_missing_association_and_multiple_band_records(self):
        missing = interpret_iscn("46,XY,t(1;2)(p11;q11)")
        self.assertEqual(missing["status"], "complete")
        self.assertEqual(missing["associations"]["match"], "none")
        band = interpret_iscn("46,XX,del(5)(p15.2)")
        names = [disease["preferred_name"] for row in band["associations"]["structural"] for disease in row["diseases"]]
        self.assertGreater(len(set(names)), 1)
        self.assertIn("not a diagnosis", band["disclaimer"])

    def test_educational_fixtures_and_probe_patterns(self):
        payload = json.loads((ROOT / "data" / "normalized" / "educational.json").read_text())
        for example in payload["examples"]:
            for formula in example["iscn"]:
                report = interpret_iscn(formula)
                self.assertEqual(report["status"], "complete", formula)
                self.assertTrue(report["visualization"], formula)
                self.assertTrue(report["associations"]["exact"], formula)
        fish = interpret_iscn("46,XY,t(9;22)(q34;q11.2)")
        patterns = {item["probe_id"]: item for item in fish["fish_probes"]}
        self.assertEqual(patterns["edu-bcr-abl1-df"]["normal_pattern"], "2R2G")
        self.assertEqual(patterns["edu-bcr-abl1-df"]["abnormal_patterns"], ["1R1G2F"])
        self.assertNotIn("edu-cep21", patterns)
        down = interpret_iscn("47,XX,+21")
        cep = next(item for item in down["fish_probes"] if item["probe_id"] == "edu-cep21")
        self.assertEqual(cep["abnormal_patterns"], ["3 signals"])

    def test_disease_lookup_does_not_invent_iscn(self):
        teaching = load_teaching_index()
        down = disease_record("medgen:C0013080", teaching)
        originals = [item["original"] for item in down["result"]["iscn_examples"]]
        self.assertIn("47,XX,+21", originals)
        self.assertIn("47,XY,+21", originals)
        classes = {item["record_class"] for item in down["result"]["iscn_examples"]}
        self.assertTrue(classes <= {"educational", "teaching-catalog"})
        self.assertFalse(down["result"]["invented_iscn"])
        self.assertTrue(down["result"]["capabilities"]["teaching_activity"])
        self.assertEqual(down["result"]["capabilities"]["teaching_href"], "#/disease/down-syndrome")

    def test_syntax_and_structure_are_checked_separately(self):
        fixtures = json.loads((ROOT / "data" / "normalized" / "syntax-fixtures.json").read_text())["fixtures"]
        for fixture in fixtures:
            report = interpret_iscn(fixture["iscn"])
            self.assertEqual(report["validation"]["syntax"], fixture["syntax"], fixture["id"])
            self.assertEqual(report["validation"]["structure"], fixture["structure"], fixture["id"])
            events = [item for line in report["lines"] for item in line["events"]]
            for expected in fixture["events"]:
                match = next((item for item in events if item["kind"] == expected["kind"]), None)
                self.assertIsNotNone(match, fixture["id"])
                if "chromosomes" in expected:
                    self.assertEqual(match["chromosomes"], expected["chromosomes"], fixture["id"])
                if "bands" in expected:
                    self.assertEqual([band.lower() for band in match["bands"]], expected["bands"], fixture["id"])
        robertsonian = interpret_iscn("45,XX,rob(14;21)(q10;q10)")
        self.assertNotEqual(robertsonian["validation"]["structure"], "validated")
        self.assertNotEqual(robertsonian["validation"]["association"], "verified")
        trisomy = interpret_iscn("47,XY,+21")
        self.assertEqual(trisomy["validation"]["syntax"], "validated")
        self.assertEqual(trisomy["validation"]["structure"], "validated")
        self.assertEqual(trisomy["validation"]["association"], "educational")

    def test_coverage_separates_reference_records_from_teaching_activities(self):
        coverage = build_coverage()
        self.assertGreater(coverage["disease_records"], 1000)
        self.assertEqual(coverage["diseases_with_verified_iscn"], 0)
        self.assertGreater(coverage["diseases_with_educational_iscn"], 0)
        self.assertGreater(coverage["complete_teaching_activities"], 0)
        self.assertLess(coverage["complete_teaching_activities"], coverage["disease_records"])
        self.assertEqual(coverage["fish_probe_definitions"], 7)


if __name__ == "__main__":
    unittest.main()
