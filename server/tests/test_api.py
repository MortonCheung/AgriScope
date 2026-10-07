"""Behavioral bridge tests; all external model/data files remain read-only."""
import copy
import http.client
import json
import os
import sys
import tempfile
import threading
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from agriscope_api import ApiError, FinalRuntime, Gateway, MAX_JSON_BYTES, make_handler, parse_json_body
from http.server import ThreadingHTTPServer


def request():
    return {"contract_version": "1", "user_context": {
        "city_id": "shenyang", "area_mu": 60, "budget_cny": 300000,
        "risk_preference": "balanced", "crop_preferences": ["西红柿", "黄瓜"],
        "actual_inputs": {}, "market_context": {"as_of": "2026-09-14", "horizon_days": 30, "harvest_date": None},
    }, "input_source": {"kind": "structured"}}


class FakeRuntime:
    def __init__(self):
        self.lock = threading.RLock()
        self.meta = {"model_version": "final_v1", "data_version": "final_v1", "code_fingerprint": "frozen"}
        self.batch_calls, self.single_calls, self.stress_calls = [], [], []
        self.changed = False
        self.raise_error = False

    def check_version(self):
        if self.changed:
            raise ApiError(503, "MODEL_UNAVAILABLE", "模型版本已更新，请重启推理服务。")

    def city_capability(self, city):
        return {"tier": "FULL" if city == "沈阳" else "LIMITED", "has_price_model": city == "沈阳",
                "crops": ["西红柿", "黄瓜"], "limitation": "" if city == "沈阳" else "不提供模型输出"}

    def crop_capability(self, city, crop):
        return {"status": "OK", "available_horizons": [7, 14, 30, 60, 90]}

    def horizon_capability(self, city, horizon):
        return {"mode": "model" if horizon < 60 else "scenario_only"}

    def market_as_of(self, city):
        return "2026-09-14"

    def evaluate_many(self, requests):
        if self.raise_error:
            raise RuntimeError("/private/secret/model.pkl unavailable")
        self.batch_calls.append(copy.deepcopy(requests))
        # The bridge must preserve an authoritative ranking that is not profit order.
        return {"status": "NO_FEASIBLE_PLAN", "ranking": [],
                "all": [{"crop": r["crop"], "status": "USER_INPUT_REQUIRED", "price": {"mid": 4.2},
                         "profit": {"available": False}, "hri": {"value": 0}} for r in requests]}

    def evaluate(self, request):
        self.single_calls.append(copy.deepcopy(request))
        actual = "actual_cost_per_mu" in request and "actual_yield_per_mu" in request
        return {"area_mu": request["area_mu"], "price": {"low": 3, "mid": 4, "high": 5},
                "profit": {"available": actual, "cost_per_mu": 2000, "expected_yield_per_mu": 3500, "profit": 123}}

    def scenario_profit(self, row, kind, factor):
        self.stress_calls.append((copy.deepcopy(row), kind, factor))
        return 41.0  # Deliberately differs from a client-side arithmetic reconstruction.


class GatewayTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.runtime = FakeRuntime()
        self.gateway = Gateway(self.root, self.runtime)

    def test_capabilities_use_canonical_crops_real_data_date_and_horizon_mode(self):
        cap = self.gateway.capabilities("shenyang")
        self.assertTrue(cap["supported"])
        self.assertEqual(cap["market_as_of"], "2026-09-14")
        self.assertEqual(cap["crops"][0]["id"], "西红柿")
        self.assertEqual(cap["crops"][0]["horizons"][-1], {"days": 90, "mode": "scenario_only"})
        self.assertFalse(self.gateway.capabilities("jinzhou")["supported"])
        self.assertIsNone(self.gateway.capabilities("jinzhou")["market_as_of"])

    def test_native_requests_keep_horizon_and_climate_date_separate(self):
        r = request()
        r["user_context"]["market_context"]["harvest_date"] = "2027-07-15"
        r["user_context"]["actual_inputs"] = {"西红柿": {"cost_per_mu": 20000, "yield_kg_per_mu": 4000}}
        result = self.gateway.decide(r)
        self.assertEqual(result["request"], r)
        native = self.runtime.batch_calls[0][0]
        self.assertEqual(native["plant_date"], "2026-09-14")
        self.assertEqual(native["harvest_date"], "2027-07-15")
        self.assertEqual(native["as_of"], "2026-09-14")
        self.assertEqual(native["horizon_days"], 30)
        self.assertEqual(native["actual_cost_per_mu"], 20000)
        self.assertNotIn("actual_cost_per_mu", self.runtime.batch_calls[0][1])

    def test_batch_status_and_input_required_price_results_are_not_rewritten(self):
        result = self.gateway.decide(request())
        self.assertEqual(result["batch"]["status"], "NO_FEASIBLE_PLAN")
        self.assertEqual(result["batch"]["ranking"], [])
        self.assertEqual(result["batch"]["all"][0]["price"]["mid"], 4.2)
        self.assertEqual(result["batch"]["all"][0]["hri"]["value"], 0)
        self.assertEqual(result["batch"]["all"][0]["status"], "USER_INPUT_REQUIRED")

    def test_empty_preferences_evaluate_registered_pool_once(self):
        r = request()
        r["user_context"]["crop_preferences"] = []
        self.gateway.decide(r)
        self.assertEqual([x["crop"] for x in self.runtime.batch_calls[0]], ["西红柿", "黄瓜"])
        self.assertEqual(len(self.runtime.batch_calls), 1)

    def test_invalid_requests_are_rejected_before_inference(self):
        mutations = [
            lambda r: r["user_context"].update(area_mu=float("nan")),
            lambda r: r["user_context"].update(area_mu=True),
            lambda r: r["user_context"].update(area_mu=10 ** 1000),
            lambda r: r["user_context"].update(budget_cny=0),
            lambda r: r["user_context"].update(city_id="../shenyang"),
            lambda r: r["user_context"].update(crop_preferences=["番茄"]),
            lambda r: r["user_context"].update(crop_preferences=["黄瓜", "黄瓜"]),
            lambda r: r["user_context"]["market_context"].update(horizon_days=31),
            lambda r: r["user_context"]["market_context"].update(horizon_days=True),
            lambda r: r["user_context"]["market_context"].update(as_of="2026-10-07"),
            lambda r: r["user_context"]["market_context"].update(harvest_date="2027-02-30"),
            lambda r: r["user_context"].update(actual_inputs={"西红柿": {"cost_per_mu": 0, "yield_kg_per_mu": None}}),
            lambda r: r.update(test_state="normal"),
            lambda r: r.update(input_source={"kind": "natural_language", "text": " "}),
        ]
        for mutate in mutations:
            with self.subTest(mutation=mutate):
                r = request()
                mutate(r)
                with self.assertRaises(ApiError):
                    self.gateway.decide(r)
        self.assertEqual(self.runtime.batch_calls, [])

    def test_unsupported_city_is_not_borrowed_from_shenyang(self):
        r = request()
        r["user_context"]["city_id"] = "dalian"
        with self.assertRaises(ApiError) as failure:
            self.gateway.decide(r)
        self.assertEqual(failure.exception.code, "INSUFFICIENT_MARKET_DATA")
        self.assertEqual(self.runtime.batch_calls, [])

    def stress_body(self, changes):
        r = request()
        r["user_context"]["actual_inputs"] = {"西红柿": {"cost_per_mu": 2000, "yield_kg_per_mu": 3500}}
        return {"request": r, "candidate_id": "西红柿", "changes": changes}

    def test_stress_delegates_to_final_native_function_and_does_not_invent_roi(self):
        c = {"price_pct": -20, "yield_pct": 0, "cost_pct": 0, "delay_days": 0}
        result = self.gateway.stress(self.stress_body(c))
        self.assertEqual(result["profit_base"], 41)
        self.assertEqual(result["delta_cny"], -82)
        self.assertTrue(result["available"])
        self.assertIsNone(result["roi"])
        self.assertEqual(self.runtime.stress_calls[0][1:], ("price", .8))
        self.assertEqual(self.runtime.stress_calls[0][0]["area_mu"], 60)

    def test_fixed_combinations_match_final_not_old_mock(self):
        for changes, kind in [((-10, -5, 10), "combo_mild"), ((-20, -15, 20), "combo_severe")]:
            result = self.gateway.stress(self.stress_body(dict(zip(("price_pct", "yield_pct", "cost_pct", "delay_days"), (*changes, 0)))))
            self.assertTrue(result["available"])
            self.assertEqual(self.runtime.stress_calls[-1][1:], (kind, None))

    def test_unsupported_combination_and_delay_never_run_local_formula(self):
        for changes in [(-20, -20, 20, 0), (0, 0, 0, 7)]:
            result = self.gateway.stress(self.stress_body(dict(zip(("price_pct", "yield_pct", "cost_pct", "delay_days"), changes))))
            self.assertFalse(result["available"])
            self.assertIsNone(result["profit_base"])
            self.assertIsNone(result["delta_cny"])
        self.assertEqual(self.runtime.single_calls, [])
        self.assertEqual(self.runtime.stress_calls, [])

    def test_missing_operating_inputs_keep_stress_unavailable(self):
        body = self.stress_body({"price_pct": -10, "yield_pct": 0, "cost_pct": 0, "delay_days": 0})
        body["request"]["user_context"]["actual_inputs"] = {}
        result = self.gateway.stress(body)
        self.assertFalse(result["available"])
        self.assertEqual(self.runtime.stress_calls, [])

    def test_stress_rejects_changed_candidate_and_non_finite_changes(self):
        body = self.stress_body({"price_pct": -10, "yield_pct": 0, "cost_pct": 0, "delay_days": 0})
        body["candidate_id"] = "番茄"
        with self.assertRaises(ApiError):
            self.gateway.stress(body)
        body["candidate_id"] = "西红柿"
        body["changes"]["cost_pct"] = float("inf")
        with self.assertRaises(ApiError):
            self.gateway.stress(body)

    def test_model_version_change_refuses_to_mix_runtime_and_new_artifacts(self):
        self.runtime.changed = True
        with self.assertRaises(ApiError) as failure:
            self.gateway.decide(request())
        self.assertEqual(failure.exception.status, 503)

    def test_daily_reads_snapshot_each_time_without_relabeling_freshness(self):
        p = self.root / "data/processed/daily/snapshots/latest.json"
        p.parent.mkdir(parents=True)
        data = {"city": "沈阳", "crops": [], "latest_data_date": "2026-10-06", "data_freshness": "DELAYED"}
        p.write_text(json.dumps(data), encoding="utf-8")
        self.assertEqual(self.gateway.daily("shenyang"), data)
        data.update(latest_data_date="2026-10-07", data_freshness="FRESH")
        p.write_text(json.dumps(data), encoding="utf-8")
        self.assertEqual(self.gateway.daily("shenyang"), data)
        with self.assertRaises(ApiError):
            self.gateway.daily("chaoyang")
        self.assertEqual(self.runtime.batch_calls, [])

    def test_daily_missing_and_malformed_snapshots_are_explicitly_unavailable(self):
        with self.assertRaises(ApiError) as missing:
            self.gateway.daily("shenyang")
        self.assertEqual(missing.exception.code, "DAILY_UNAVAILABLE")
        p = self.root / "data/processed/daily/snapshots/latest.json"
        p.parent.mkdir(parents=True)
        p.write_text('{"city":"大连","crops":[]}', encoding="utf-8")
        with self.assertRaises(ApiError):
            self.gateway.daily("shenyang")

    def test_json_rejects_duplicate_keys_and_non_standard_numbers(self):
        for text in [b'{"a":1,"a":2}', b'{"a":NaN}', b'{"a":Infinity}', b'not-json']:
            with self.assertRaises(ApiError):
                parse_json_body(text)


class HttpTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.temp = tempfile.TemporaryDirectory()
        cls.root = Path(cls.temp.name)
        cls.frontend = cls.root / "dist"
        cls.frontend.mkdir()
        (cls.frontend / "index.html").write_text("<h1>AgriScope</h1>", encoding="utf-8")
        (cls.root / "secret.txt").write_text("do not expose", encoding="utf-8")
        (cls.frontend / "escape.txt").symlink_to(cls.root / "secret.txt")
        cls.runtime = FakeRuntime()
        cls.server = ThreadingHTTPServer(("127.0.0.1", 0), make_handler(Gateway(cls.root, cls.runtime), cls.frontend, ("http://localhost:5173",)))
        cls.thread = threading.Thread(target=cls.server.serve_forever, daemon=True)
        cls.thread.start()

    @classmethod
    def tearDownClass(cls):
        cls.server.shutdown()
        cls.server.server_close()
        cls.thread.join()
        cls.temp.cleanup()

    def call(self, method, path, body=None, headers=None):
        connection = http.client.HTTPConnection(*self.server.server_address, timeout=5)
        headers = headers or {}
        if isinstance(body, dict):
            body = json.dumps(body).encode("utf-8")
            headers = {"Content-Type": "application/json", **headers}
        connection.request(method, path, body=body, headers=headers)
        response = connection.getresponse()
        result = response.status, dict(response.getheaders()), response.read()
        connection.close()
        return result

    def test_http_decision_and_capability_are_real_json_and_never_cached(self):
        for method, path, body in [("GET", "/api/decision/capabilities?city=shenyang", None), ("POST", "/api/decision", request())]:
            status, headers, data = self.call(method, path, body)
            self.assertEqual(status, 200)
            self.assertEqual(headers["Cache-Control"], "no-store")
            self.assertIn("model_version", json.loads(data))

    def test_rejects_too_large_non_json_cross_origin_and_test_queries(self):
        cases = [
            ("/api/decision", b"{}", {"Content-Type": "application/json", "Content-Length": str(MAX_JSON_BYTES + 1)}, 413),
            ("/api/decision", b"{}", {"Content-Type": "text/plain"}, 415),
            ("/api/decision", request(), {"Origin": "https://untrusted.example"}, 403),
            ("/api/decision?test_state=normal", request(), {}, 400),
        ]
        for path, body, headers, expected in cases:
            with self.subTest(path=path, expected=expected):
                self.assertEqual(self.call("POST", path, body, headers)[0], expected)

    def test_error_does_not_expose_external_absolute_paths(self):
        self.runtime.raise_error = True
        try:
            status, _, payload = self.call("POST", "/api/decision", request())
            self.assertEqual(status, 503)
            self.assertNotIn(b"/private", payload)
            self.assertEqual(json.loads(payload)["status"], "MODEL_UNAVAILABLE")
        finally:
            self.runtime.raise_error = False

    def test_static_spa_fallback_and_traversal_or_symlink_escape(self):
        self.assertEqual(self.call("GET", "/cities/shenyang/decision")[2], b"<h1>AgriScope</h1>")
        for path in ["/%2e%2e/secret.txt", "/escape.txt", "/api/unknown", "/missing.js"]:
            with self.subTest(path=path):
                status, _, body = self.call("GET", path)
                self.assertEqual(status, 404)
                self.assertNotIn(b"do not expose", body)


@unittest.skipUnless(os.environ.get("AG_SCOPE_RUN_MODEL_TESTS") == "1", "Enable explicit read-only Final integration test")
class FinalIntegrationTests(unittest.TestCase):
    def test_real_final_outputs_and_native_stress(self):
        workspace = Path(__file__).resolve().parents[3]
        runtime = FinalRuntime(workspace)
        gateway = Gateway(workspace, runtime)
        cap = gateway.capabilities("shenyang")
        r = request()
        r["user_context"]["market_context"]["as_of"] = cap["market_as_of"]
        r["user_context"]["crop_preferences"] = ["西红柿"]
        no_inputs = gateway.decide(r)
        self.assertEqual(no_inputs["batch"]["all"][0]["status"], "USER_INPUT_REQUIRED")
        self.assertIsNotNone(no_inputs["batch"]["all"][0]["price"])
        r["user_context"]["actual_inputs"] = {"西红柿": {"cost_per_mu": 20000, "yield_kg_per_mu": 4000}}
        evaluated = gateway.decide(r)["batch"]["all"][0]
        self.assertEqual(evaluated["profit"]["cost_source_class"], "user_input")
        changes = {"price_pct": -20, "yield_pct": -15, "cost_pct": 20, "delay_days": 0}
        stressed = gateway.stress({"request": r, "candidate_id": "西红柿", "changes": changes})
        self.assertTrue(stressed["available"])
        self.assertLess(stressed["profit_base"], evaluated["profit"]["profit"])
        self.assertIsNone(stressed["roi"])


if __name__ == "__main__":
    unittest.main()
