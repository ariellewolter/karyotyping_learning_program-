import json
import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))
sys.path.insert(0, str(ROOT / "src"))

from update_verification_ledger import LEDGER, STATUSES, entry_problems  # noqa: E402


class VerificationLedgerTest(unittest.TestCase):
    def setUp(self):
        self.ledger = json.loads(LEDGER.read_text())

    def test_every_verified_entry_is_complete(self):
        for entry in self.ledger["entries"]:
            if entry["status"] == "verified":
                self.assertEqual(entry_problems(entry), [], entry["iscn"])

    def test_statuses_are_known(self):
        for entry in self.ledger["entries"]:
            self.assertIn(entry["status"], STATUSES)

    def test_prose_is_never_verified(self):
        for entry in self.ledger["entries"]:
            if entry.get("kind") == "note":
                self.assertNotEqual(entry["status"], "verified", entry["iscn"])

    def test_documented_sources_have_excerpts(self):
        for disease_id, disease in self.ledger.get("diseases", {}).items():
            for name, facet in disease["facets"].items():
                if facet["status"] == "supported":
                    self.assertTrue(facet["sources"], f"{disease_id}.{name}")
                    for source in facet["sources"]:
                        self.assertTrue(source.get("url") and source.get("excerpt"), f"{disease_id}.{name}")

    def test_rejected_entries_explain_why(self):
        for entry in self.ledger["entries"]:
            if entry["status"] == "rejected":
                self.assertTrue(entry["reviewer_note"].strip(), entry["iscn"])

    def test_blank_entry_is_not_verifiable(self):
        entry = dict(self.ledger["entries"][0], status="verified", finding="", source={"citation": "", "identifier": "", "url": "", "reviewed": ""})
        self.assertIn("finding", entry_problems(entry))
        self.assertIn("source.citation", entry_problems(entry))


if __name__ == "__main__":
    unittest.main()
