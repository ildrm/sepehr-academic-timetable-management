"""Read a versioned snapshot on stdin and emit a single verified JSON result."""
import hashlib
import itertools
import json
import os
import pathlib
import sys
import time
from ortools import __version__ as version
from ortools.sat.python import cp_model
from jsonschema import Draft202012Validator, FormatChecker

ROOT = pathlib.Path(os.getenv("SPECIFICATION_ROOT", "docx")) / "artifacts" / "schemas"


def validate(name, value):
    schema = json.loads((ROOT / (name + ".schema.json")).read_text())
    Draft202012Validator(schema, format_checker=FormatChecker()).validate(value)


def conflict(a, b):
    if a["room"] != b["room"] and a["instructor"] != b["instructor"]:
        return False
    return any(x["weekDate"] == y["weekDate"] and x["startMinute"] < y["endMinute"]
               and y["startMinute"] < x["endMinute"] for x in a["intervals"] for y in b["intervals"])


def solve(raw, configuration, seconds):
    spec = json.loads(raw)
    validate("solver-input", spec)
    model = cp_model.CpModel()
    variables, placements = {}, {}
    tiers = spec["constraints"]["objectiveTiers"]
    classes = spec["classes"]
    if len(classes) > 250 or sum(len(c["placements"]) for c in classes) > 2500:
        raise ValueError("planning input exceeds configured model limits")
    class_ids = set()
    for cls in classes:
        if cls["id"] in class_ids:
            raise ValueError("duplicate class identity")
        class_ids.add(cls["id"])
        choices = []
        for p in cls["placements"]:
            key = (cls["id"], p["id"])
            if key in variables or len(p["preferenceCosts"]) != len(tiers):
                raise ValueError("inconsistent placement identity or objective vector")
            if any(not 0 <= x["startMinute"] < x["endMinute"] <= 1440 for x in p["intervals"]):
                raise ValueError("invalid half-open interval")
            variable = model.new_bool_var("placement_" + str(len(variables)))
            variables[key], placements[key] = variable, p
            choices.append(variable)
            if cls["pinned"] is not None and p["id"] != cls["pinned"]:
                model.add(variable == 0)
        model.add(sum(choices) == 1)
    for a, b in itertools.combinations(variables, 2):
        if a[0] != b[0] and conflict(placements[a], placements[b]):
            model.add(variables[a] + variables[b] <= 1)
    for pair in spec["constraints"]["forbiddenPairs"]:
        a, b = ((pair[k]["classId"], pair[k]["placementId"]) for k in ("a", "b"))
        model.add(variables[a] + variables[b] <= 1)
    for cap in spec["constraints"]["workloadCaps"]:
        model.add(sum(variables[k] * p["loadUnits"] for k, p in placements.items()
                      if p["instructor"] == cap["instructor"]) <= cap["maxUnits"])
    costs = [sum(variables[k] * p["preferenceCosts"][i] * tier["weight"] for k, p in placements.items())
             for i, tier in enumerate(tiers)]
    deadline = time.monotonic() + seconds
    solver = cp_model.CpSolver()
    solver.parameters.num_search_workers = 1
    solver.parameters.random_seed = spec["configuration"]["seed"]
    status, assignments, vector = "UNKNOWN", [], []
    for objective in costs or [None]:
        remaining = deadline - time.monotonic()
        if remaining <= 0:
            status = "FEASIBLE" if assignments else "UNKNOWN"
            break
        solver.parameters.max_time_in_seconds = remaining
        if objective is not None:
            model.minimize(objective)
        result = solver.solve(model)
        status = solver.status_name(result)
        if result not in (cp_model.FEASIBLE, cp_model.OPTIMAL):
            if result == cp_model.UNKNOWN and assignments:
                status = "FEASIBLE"
            break
        assignments = [{"classId": a, "placementId": b} for (a, b), v in variables.items() if solver.value(v)]
        vector = [solver.value(score) for score in costs]
        if result != cp_model.OPTIMAL:
            break
        if objective is not None:
            model.add(objective == solver.value(objective))
    result = {
        "snapshotId": spec["snapshotId"], "inputSha256": hashlib.sha256(raw).hexdigest(),
        "solverVersion": version, "status": status, "assignments": assignments,
        "objectiveScore": vector[0] if vector else None, "objectiveVector": vector,
        "boundVector": vector if status == "OPTIMAL" else None,
        "unassigned": [], "configurationId": configuration,
    }
    validate("solver-output", result)
    return result


if __name__ == "__main__":
    config, limit = sys.argv[1:3]
    print(json.dumps(solve(sys.stdin.buffer.read(), config, float(limit)), separators=(",", ":")))
