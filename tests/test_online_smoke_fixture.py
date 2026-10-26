import importlib.util
import json
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
SCRIPT_PATH = ROOT / "scripts" / "verify-local-supabase-online.py"
SPEC = importlib.util.spec_from_file_location("online_smoke", SCRIPT_PATH)
assert SPEC and SPEC.loader
online_smoke = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(online_smoke)


class OnlineSmokeFixtureTests(unittest.TestCase):
    def test_smoke_pack_uses_a_test_only_short_hide_timer_without_mutating_base_pack(self):
        base_pack = json.loads((ROOT / "samples" / "generated" / "jet-lag-the-game.content-pack.json").read_text())

        smoke_pack = online_smoke.create_smoke_pack(base_pack)
        base_rules = next(rule for rule in base_pack["rulesets"] if rule["rulesetId"] == "jet-lag-home-game-base")
        smoke_rules = next(rule for rule in smoke_pack["rulesets"] if rule["rulesetId"] == "jet-lag-home-game-base")

        self.assertEqual(base_rules["phasePolicies"]["hidePhaseDurationSecondsByScale"]["small"], 1800)
        self.assertEqual(
            smoke_rules["phasePolicies"]["hidePhaseDurationSecondsByScale"]["small"],
            online_smoke.SMOKE_HIDE_PHASE_SECONDS,
        )


if __name__ == "__main__":
    unittest.main()
