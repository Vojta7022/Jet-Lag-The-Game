import importlib.util
import unittest
from pathlib import Path


SCRIPT = Path(__file__).resolve().parents[2] / "scripts" / "verify-local-supabase-online.py"
SPEC = importlib.util.spec_from_file_location("verify_local_supabase_online", SCRIPT)
MODULE = importlib.util.module_from_spec(SPEC)
assert SPEC.loader is not None
SPEC.loader.exec_module(MODULE)


class OnlineSmokePackTests(unittest.TestCase):
    def test_smoke_pack_identity_is_stable_for_unchanged_content_and_changes_with_content(self):
        base = {"packId": "base", "packVersion": "1.0.0", "title": "Base", "questionTemplates": []}
        first = MODULE.create_smoke_pack(base)
        repeated = MODULE.create_smoke_pack(base)
        changed = MODULE.create_smoke_pack({**base, "title": "Changed"})

        self.assertEqual(first, repeated)
        self.assertNotEqual(first["packId"], base["packId"])
        self.assertNotEqual(first["packId"], changed["packId"])
        self.assertEqual(first["packVersion"], "0.2.0")


if __name__ == "__main__":
    unittest.main()
