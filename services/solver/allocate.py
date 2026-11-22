"""Optimize approved batch input. Database writes are handled by the guarded API."""
from fractions import Fraction
from hashlib import sha256
import json
import sys
import time

from ortools import __version__
from ortools.sat.python import cp_model


def lottery_order(seed, variables):
    return sorted(variables, key=lambda key: (sha256(f"{seed}:{key}".encode()).digest(), key))


def solve(data, seconds):
    model = cp_model.CpModel()
    applicants = data["applicants"]
    seats = {seat["id"]: [] for seat in data["seats"]}
    options, seat_choices = {}, {}
    for user in applicants:
        choices = []
        for option in user["options"]:
            identity = option["id"]
            choice = model.new_bool_var(f"choice_{len(options)}")
            options[identity] = choice
            choices.append(choice)
            option_seats = []
            for claim in option["claims"]:
                usable = {}
                for key in claim["seats"]:
                    reserved = model.new_bool_var(f"seat_{identity}_{len(option_seats)}_{key}")
                    seats[key].append(reserved)
                    usable[key] = reserved
                model.add(sum(usable.values()) == choice)
                option_seats.append(usable)
            seat_choices[identity] = option_seats
        model.add(sum(choices) <= 1)
    for seat in data["seats"]:
        model.add(sum(seats[seat["id"]]) <= seat["capacity"])

    objectives = []
    for tier in sorted({user["tier"] for user in applicants}):
        users = [a for a in applicants if a["tier"] == tier and a["requested"] > 0]
        if not users:
            continue
        fractions = sorted({Fraction(0)} | {
            Fraction(o["credits"], a["requested"]) for a in users for o in a["options"]
        })
        ranks = {fraction: rank for rank, fraction in enumerate(fractions)}
        minimum = model.new_int_var(0, len(ranks) - 1, f"minimum_{tier}")
        for user in users:
            model.add(minimum <= sum(
                ranks[Fraction(o["credits"], user["requested"])] * options[o["id"]]
                for o in user["options"]
            ))
        objectives.append(minimum)
        objectives.append(sum(
            o["credits"] * options[o["id"]] for user in users for o in user["options"]
        ))

    academic_objectives = len(objectives)
    order = lottery_order(data["seed"], options)
    for i in range(0, len(order), 20):
        keys = order[i:i+20]
        objectives.append(sum(2 ** (len(keys) - j - 1) * options[key] for j, key in enumerate(keys)))

    deadline = time.monotonic() + seconds
    solver = cp_model.CpSolver()
    solver.parameters.num_search_workers = 1
    scores, status = [], "UNKNOWN"
    for i, objective in enumerate(objectives or [0]):
        budget = deadline - time.monotonic()
        if budget <= 0:
            return output("UNKNOWN")
        solver.parameters.max_time_in_seconds = budget
        model.maximize(objective)
        status = solver.status_name(solver.solve(model))
        if status != "OPTIMAL":
            return output(status)
        value = solver.value(objective)
        model.add(objective == value)
        if i < academic_objectives:
            scores.append(value)

    selected = []
    for user in applicants:
        for option in user["options"]:
            key = option["id"]
            if solver.value(options[key]):
                assigned = [next(k for k, v in claim.items() if solver.value(v)) for claim in seat_choices[key]]
                selected.append({"application": user["id"], "option": key, "seats": assigned})
    return output(status, selected, scores)


def output(status, selected=None, scores=None):
    return {"status": status, "selected": selected or [], "objective": scores or [], "solverVersion": __version__}


if __name__ == "__main__":
    print(json.dumps(solve(json.load(sys.stdin), int(sys.argv[1])), separators=(",", ":")))
