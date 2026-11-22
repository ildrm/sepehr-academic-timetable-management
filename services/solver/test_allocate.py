import unittest
from services.solver.allocate import solve,lottery_order


def option(key,credits,seats):
    return {"id":key,"credits":credits,"claims":[{"index":0,"seats":seats}]}


def user(key,tier,options):
    return {"id":key,"tier":tier,"requested":100,"options":options}


class AllocationTest(unittest.TestCase):
    def test_priority_and_reserved_seats(self):
        data={"seed":"sample","seats":[{"id":"public","capacity":1},{"id":"private","capacity":1}],
              "applicants":[user("first",0,[option("f",100,["public","private"])]),
                            user("second",1,[option("s",100,["public"])]),
                            user("third",2,[option("t",100,["public"])])]}
        result=solve(data,5)
        self.assertEqual(result["status"],"OPTIMAL")
        self.assertEqual([(x["application"],x["seats"]) for x in result["selected"]],
                         [("first",["private"]),("second",["public"])])

    def test_lottery_is_reproducible_for_ties(self):
        data={"seed":"sample","seats":[{"id":"single","capacity":1}],
              "applicants":[user("first",0,[option("f",100,["single"])]),
                            user("second",0,[option("s",100,["single"])])]}
        expected=lottery_order(data["seed"],["f","s"])[0]
        self.assertEqual(solve(data,5)["selected"][0]["option"],expected)
        self.assertEqual(solve(data,5),solve(data,5))

    def test_minimum_fraction_precedes_total(self):
        data={"seed":"sample","seats":[{"id":"a","capacity":1},{"id":"b","capacity":1}],
              "applicants":[user("first",0,[option("large",100,["a"]),option("small",30,["b"])]),
                            user("second",0,[option("other",30,["a"])])]}
        self.assertEqual({x["option"] for x in solve(data,5)["selected"]},{"small","other"})
        self.assertEqual(solve(data,0)["status"],"UNKNOWN")
