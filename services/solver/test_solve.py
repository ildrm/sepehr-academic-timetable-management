import json
from pathlib import Path
import unittest
from services.solver.solve import solve

fixture = Path("docx/artifacts/examples/solver-input.json")

class TimetableTest(unittest.TestCase):
    def test_pinned_and_minimum_penalty(self):
        result = solve(fixture.read_bytes(), "test", 5.0)
        self.assertEqual(result["status"], "OPTIMAL")
        self.assertEqual(result["objectiveScore"], 3)
        self.assertEqual(result["assignments"], [{"classId":"A","placementId":"A2"},{"classId":"B","placementId":"B1"}])

    def test_pinned_conflicting_placements(self):
        data = json.loads(fixture.read_text())
        data["classes"][0]["pinned"] = "A1"
        result = solve(json.dumps(data).encode(), "test", 5.0)
        self.assertEqual(result["status"], "INFEASIBLE")
        self.assertEqual(result["assignments"], [])

    def test_exhausted_budget_stays_unknown(self):
        self.assertEqual(solve(fixture.read_bytes(), "test", 0)["status"], "UNKNOWN")

if __name__ == "__main__":
    unittest.main()
