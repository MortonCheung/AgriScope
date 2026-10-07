#!/usr/bin/env python3
"""Read-only HTTP bridge to AgriScope's existing Final Model and Daily snapshot."""
from __future__ import annotations

import sys

# This bridge must not create bytecode in the externally owned model tree.
sys.dont_write_bytecode = True

import argparse
import json
import math
import mimetypes
import os
import threading
from datetime import date
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any, Optional
from urllib.parse import parse_qs, unquote, urlsplit

MAX_JSON_BYTES = 64 * 1024
HORIZONS = (7, 14, 30, 60, 90)
CITY_NAMES = {
    "shenyang": "沈阳", "chaoyang": "朝阳", "jinzhou": "锦州", "dalian": "大连",
    "tieling": "铁岭", "dandong": "丹东", "anshan": "鞍山", "fushun": "抚顺",
    "benxi": "本溪", "yingkou": "营口", "fuxin": "阜新", "liaoyang": "辽阳",
    "panjin": "盘锦", "huludao": "葫芦岛",
}


class ApiError(Exception):
    def __init__(self, status: int, code: str, message: str):
        super().__init__(message)
        self.status, self.code, self.message = status, code, message


def invalid(message: str) -> None:
    raise ApiError(400, "INVALID_REQUEST", message)


def finite(value: Any) -> bool:
    if not isinstance(value, (int, float)) or isinstance(value, bool):
        return False
    try:
        return math.isfinite(value)
    except OverflowError:
        return False


def iso_date(value: Any) -> bool:
    if not isinstance(value, str):
        return False
    try:
        return date.fromisoformat(value).isoformat() == value
    except (ValueError, TypeError):
        return False


def clean_json(value: Any) -> Any:
    """Unavailable model numerics remain null; neither NaN nor Infinity reaches UI."""
    if isinstance(value, dict):
        return {str(k): clean_json(v) for k, v in value.items()}
    if isinstance(value, (list, tuple)):
        return [clean_json(v) for v in value]
    if isinstance(value, float) and not math.isfinite(value):
        return None
    return value


class FinalRuntime:
    """One engine per process. All inference is delegated to existing model code."""
    def __init__(self, workspace: Path):
        self.workspace = workspace.resolve()
        self.lock = threading.RLock()
        model_src = self.workspace / "models" / "src"
        if not model_src.is_dir():
            raise ApiError(503, "MODEL_UNAVAILABLE", "正式模型尚未部署。")
        sys.path.insert(0, str(model_src))
        # common.py currently has a machine-specific ROOT. Configure it in memory
        # before Final modules capture those constants; never edit model files.
        from decision_engine import common
        loaded = sys.modules.get("decision_engine.final.fcommon")
        if loaded is not None and loaded.SNAPSHOT_DIR != self.workspace / "models/data/snapshots/final_v1":
            raise ApiError(503, "MODEL_UNAVAILABLE", "更换模型目录后需要重启推理服务。")
        common.ROOT = self.workspace
        common.DE = self.workspace / "models"
        from decision_engine.final import capabilities
        from decision_engine.final.inference import FinalDecisionEngine, _Data
        from decision_engine.final.optimize import _scenario_profit
        self.capability_module = capabilities
        self.data = _Data
        self.engine = FinalDecisionEngine()
        self.stress_function = _scenario_profit
        self.meta_path = self.workspace / "models/reports/final/FINAL_RUN_META.json"
        self.meta = self._read_meta()

    def _read_meta(self) -> dict:
        try:
            meta = json.loads(self.meta_path.read_text(encoding="utf-8"))
            if not isinstance(meta, dict) or not all(isinstance(meta.get(k), str) and meta[k] for k in ("model_version", "data_version", "code_fingerprint")):
                raise ValueError("missing metadata")
            return {k: meta[k] for k in ("model_version", "data_version", "code_fingerprint")}
        except (OSError, ValueError, TypeError):
            raise ApiError(503, "MODEL_UNAVAILABLE", "正式模型版本信息暂时不可用。") from None

    def check_version(self) -> None:
        if self._read_meta() != self.meta:
            raise ApiError(503, "MODEL_UNAVAILABLE", "模型版本已更新，请重启推理服务。")

    def city_capability(self, city: str) -> dict:
        return self.capability_module.city_capability(city)

    def crop_capability(self, city: str, crop: str) -> dict:
        return self.capability_module.crop_capability(city, crop)

    def horizon_capability(self, city: str, horizon: int) -> dict:
        return self.capability_module.horizon_capability(city, horizon)

    def market_as_of(self, city: str) -> Optional[str]:
        latest = self.data.dataset(city)["date"].max()
        return None if latest is None or str(latest) == "NaT" else str(latest.date())

    def evaluate_many(self, requests: list) -> dict:
        return self.engine.evaluate_many(requests)

    def evaluate(self, request: dict) -> dict:
        return self.engine.evaluate(request)

    def scenario_profit(self, row: dict, kind: str, factor: Optional[float]) -> float:
        return self.stress_function(row, kind, factor)


class Gateway:
    def __init__(self, workspace: Path, runtime: Any = None):
        self.workspace = workspace.resolve()
        self._runtime = runtime
        self._initialization_lock = threading.Lock()

    @property
    def runtime(self) -> Any:
        with self._initialization_lock:
            if self._runtime is None:
                self._runtime = FinalRuntime(self.workspace)
        return self._runtime

    def capabilities(self, city_id: str) -> dict:
        if city_id not in CITY_NAMES:
            invalid("城市入口不存在。")
        runtime = self.runtime
        with runtime.lock:
            runtime.check_version()
            city = CITY_NAMES[city_id]
            cap = runtime.city_capability(city)
            crops = []
            if cap.get("has_price_model"):
                for crop in cap.get("crops") or []:
                    ccap = runtime.crop_capability(city, crop)
                    if ccap.get("status") != "OK":
                        continue
                    horizons = [{"days": h, "mode": runtime.horizon_capability(city, h)["mode"]}
                                for h in HORIZONS if h in (ccap.get("available_horizons") or [])]
                    crops.append({"id": crop, "label": crop, "horizons": horizons})
            supported = bool(cap.get("has_price_model") and crops)
            return {"city_id": city_id, "tier": cap.get("tier", "UNKNOWN"), "supported": supported,
                    "crops": crops, "market_as_of": runtime.market_as_of(city) if supported else None,
                    **runtime.meta, "limitation": cap.get("limitation") or ("" if supported else "暂时没有同口径决策模型。")}

    def validate_request(self, request: Any) -> tuple:
        if not isinstance(request, dict) or request.get("contract_version") != "1":
            invalid("种植条件版本或格式不完整。")
        if set(request) - {"contract_version", "user_context", "input_source"}:
            invalid("种植条件含不支持的字段。")
        c = request.get("user_context")
        if not isinstance(c, dict) or set(c) != {"city_id", "area_mu", "budget_cny", "risk_preference", "crop_preferences", "actual_inputs", "market_context"}:
            invalid("种植条件格式不完整。")
        city_id = c.get("city_id")
        if not isinstance(city_id, str) or city_id not in CITY_NAMES:
            invalid("城市入口不存在。")
        if not all(finite(c.get(k)) and c[k] > 0 for k in ("area_mu", "budget_cny")):
            invalid("面积与预算需要是大于零的有限数字。")
        if c.get("risk_preference") not in ("conservative", "balanced", "aggressive"):
            invalid("请选择决策偏好。")
        source = request.get("input_source")
        if not isinstance(source, dict) or set(source) - {"kind", "text"} or source.get("kind") not in ("structured", "natural_language"):
            invalid("输入来源格式有误。")
        if "text" in source and (not isinstance(source["text"], str) or len(source["text"]) > 4000):
            invalid("输入原文格式有误。")
        if source["kind"] == "natural_language" and not source.get("text", "").strip():
            invalid("自然语言输入原文不完整。")
        m = c.get("market_context")
        if not isinstance(m, dict) or set(m) != {"as_of", "horizon_days", "harvest_date"} or not iso_date(m.get("as_of")):
            invalid("市场数据日期格式有误。")
        h = m.get("horizon_days")
        if not isinstance(h, int) or isinstance(h, bool) or h not in HORIZONS:
            invalid("比较周期需要是 7、14、30、60 或 90 天。")
        if m.get("harvest_date") is not None and not iso_date(m["harvest_date"]):
            invalid("气候参照日期格式有误。")
        preferred = c.get("crop_preferences")
        actual = c.get("actual_inputs")
        if not isinstance(preferred, list) or len(preferred) > 20 or any(not isinstance(crop, str) for crop in preferred) or len(set(preferred)) != len(preferred):
            invalid("作物偏好格式有误。")
        if not isinstance(actual, dict) or len(actual) > 20:
            invalid("实际成本与亩产格式有误。")
        cap = self.capabilities(city_id)
        if not cap["supported"]:
            raise ApiError(422, "INSUFFICIENT_MARKET_DATA", "这个城市暂时没有同口径种植决策模型。")
        allowed = {crop["id"]: crop for crop in cap["crops"]}
        if any(crop not in allowed for crop in preferred) or any(crop not in allowed for crop in actual):
            invalid("请选择模型支持的规范作物名称。")
        for inputs in actual.values():
            if not isinstance(inputs, dict) or set(inputs) != {"cost_per_mu", "yield_kg_per_mu"}:
                invalid("实际成本与亩产格式有误。")
            if any(v is not None and (not finite(v) or v <= 0) for v in inputs.values()):
                invalid("实际成本与亩产需要是大于零的有限数字，缺失请留空。")
        selected = preferred or list(allowed)
        if any(h not in [x["days"] for x in allowed[crop]["horizons"]] for crop in selected):
            invalid("当前作物不支持这个比较周期。")
        if cap["market_as_of"] is None or m["as_of"] > cap["market_as_of"]:
            invalid("市场日期不能晚于正式模型的最新数据日期。")
        return c, selected

    @staticmethod
    def native_request(c: dict, crop: str) -> dict:
        m = c["market_context"]
        request = {"request_id": crop, "city": CITY_NAMES[c["city_id"]], "crop": crop,
                   "area_mu": c["area_mu"], "budget": c["budget_cny"], "risk_preference": c["risk_preference"],
                   "as_of": m["as_of"], "horizon_days": m["horizon_days"], "plant_date": m["as_of"]}
        if m["harvest_date"] is not None:
            request["harvest_date"] = m["harvest_date"]
        inputs = c["actual_inputs"].get(crop, {})
        if inputs.get("cost_per_mu") is not None:
            request["actual_cost_per_mu"] = inputs["cost_per_mu"]
        if inputs.get("yield_kg_per_mu") is not None:
            request["actual_yield_per_mu"] = inputs["yield_kg_per_mu"]
        return request

    def decide(self, request: Any) -> dict:
        c, crops = self.validate_request(request)
        runtime = self.runtime
        with runtime.lock:
            runtime.check_version()
            batch = runtime.evaluate_many([self.native_request(c, crop) for crop in crops])
            return clean_json({"request": request, "batch": batch, "market_as_of": c["market_context"]["as_of"], **runtime.meta})

    def stress(self, body: Any) -> dict:
        if not isinstance(body, dict) or set(body) != {"request", "candidate_id", "changes"}:
            invalid("压力条件格式不完整。")
        c, selected = self.validate_request(body["request"])
        crop = body["candidate_id"]
        if not isinstance(crop, str) or crop not in selected:
            invalid("压力方案需要对应当前请求中的规范作物。")
        changes = body["changes"]
        if not isinstance(changes, dict) or set(changes) != {"price_pct", "yield_pct", "cost_pct", "delay_days"}:
            invalid("请提供完整的四项压力变化。")
        if not all(finite(v) for v in changes.values()):
            invalid("压力变化需要是有限数字。")
        if not (-100 <= changes["price_pct"] <= 0 and -100 <= changes["yield_pct"] <= 0 and 0 <= changes["cost_pct"] <= 100):
            invalid("价格与亩产变化需在 -100% 到 0%，成本变化需在 0% 到 100%。")
        if not isinstance(changes["delay_days"], int) or isinstance(changes["delay_days"], bool) or not 0 <= changes["delay_days"] <= 60:
            invalid("上市延迟需要是 0 到 60 个整天。")
        runtime = self.runtime
        result = {"candidate_id": crop, "changes": changes, "profit_base": None, "roi": None,
                  "delta_cny": None, "available": False, "note": "", **{k: runtime.meta[k] for k in ("model_version", "data_version")}}
        if changes["delay_days"]:
            result["note"] = "正式模型没有上市延迟重估接口，暂不估算这组收益。"
            return result
        values = (changes["price_pct"], changes["yield_pct"], changes["cost_pct"])
        if values == (-10, -5, 10):
            kind, factor = "combo_mild", None
        elif values == (-20, -15, 20):
            kind, factor = "combo_severe", None
        elif sum(v != 0 for v in values) <= 1:
            key = next((i for i, v in enumerate(values) if v != 0), 0)
            kind, factor = ("price", "yield", "cost")[key], 1 + values[key] / 100
        else:
            result["note"] = "正式模型仅支持单项压力与两组固定综合压力，暂不估算这组组合。"
            return result
        with runtime.lock:
            runtime.check_version()
            evaluated = runtime.evaluate(self.native_request(c, crop))
            price, profit = evaluated.get("price"), evaluated.get("profit")
            if not isinstance(price, dict) or not isinstance(profit, dict) or not profit.get("available"):
                result["note"] = "补充实际亩均成本与亩产后，再查看正式收益压力。"
                return result
            source = {"price_low": price.get("low"), "price_mid": price.get("mid"), "price_high": price.get("high"),
                      "area_mu": evaluated.get("area_mu"), "cost_per_mu": profit.get("cost_per_mu"),
                      "expected_yield_per_mu": profit.get("expected_yield_per_mu")}
            if not all(finite(v) for v in source.values()) or not finite(profit.get("profit")):
                result["note"] = "正式方案缺少可用的收益核算字段。"
                return result
            stressed = runtime.scenario_profit(source, kind, factor)
            if not finite(stressed):
                result["note"] = "正式模型暂时无法核算这组压力。"
                return result
            result.update({"profit_base": stressed, "delta_cny": stressed - profit["profit"], "available": True,
                           "note": "正式模型参数压力结果；仅返回基准收益，未提供上下行情景与回报率。"})
            return clean_json(result)

    def daily(self, city_id: str) -> dict:
        if city_id != "shenyang":
            raise ApiError(404, "DAILY_UNAVAILABLE", "这个城市暂时没有每日市场数据。")
        path = self.workspace / "data/processed/daily/snapshots/latest.json"
        try:
            if path.stat().st_size > 4 * 1024 * 1024:
                raise ValueError("snapshot too large")
            data = json.loads(path.read_text(encoding="utf-8"))
            if not isinstance(data, dict) or data.get("city") not in ("沈阳", "沈阳市") or not isinstance(data.get("crops"), list):
                raise ValueError("invalid daily snapshot")
            return clean_json(data)
        except (OSError, ValueError, TypeError):
            raise ApiError(503, "DAILY_UNAVAILABLE", "最新官方市场数据暂时无法读取。") from None


def parse_json_body(body: bytes) -> Any:
    def unique(pairs: list) -> dict:
        value = {}
        for key, item in pairs:
            if key in value:
                raise ValueError("duplicate key")
            value[key] = item
        return value
    def constant(_value: str) -> None:
        raise ValueError("non-finite constant")
    try:
        return json.loads(body.decode("utf-8"), object_pairs_hook=unique, parse_constant=constant)
    except (UnicodeDecodeError, ValueError, RecursionError):
        invalid("请求需要是完整的标准 JSON。")


def make_handler(gateway: Gateway, frontend: Optional[Path] = None, allowed_origins: tuple = ()):
    root = frontend.resolve() if frontend is not None else None

    class Handler(BaseHTTPRequestHandler):
        server_version = "AgriScope"
        sys_version = ""

        def log_message(self, _format: str, *_args: Any) -> None:
            # Do not echo user input or machine-specific paths into access logs.
            pass

        def setup(self) -> None:
            super().setup()
            self.connection.settimeout(30)

        def json_response(self, status: int, value: Any) -> None:
            payload = json.dumps(clean_json(value), ensure_ascii=False, allow_nan=False).encode("utf-8")
            self.send_response(status)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Cache-Control", "no-store")
            self.send_header("X-Content-Type-Options", "nosniff")
            self.send_header("Content-Length", str(len(payload)))
            self.end_headers()
            self.wfile.write(payload)

        def guarded(self, operation: Any) -> None:
            try:
                operation()
            except ApiError as error:
                self.json_response(error.status, {"status": error.code, "error": error.message})
            except (BrokenPipeError, ConnectionResetError):
                pass
            except Exception:
                self.json_response(503, {"status": "MODEL_UNAVAILABLE", "error": "服务暂时不可用，请稍后重试。"})

        def do_GET(self) -> None:
            self.guarded(self.get_route)

        def get_route(self) -> None:
            url = urlsplit(self.path)
            query = parse_qs(url.query, keep_blank_values=True)
            if url.path in ("/api/decision/capabilities", "/api/daily/latest"):
                if set(query) != {"city"} or len(query["city"]) != 1:
                    invalid("请提供一个城市入口。")
                value = gateway.capabilities(query["city"][0]) if url.path.endswith("capabilities") else gateway.daily(query["city"][0])
                self.json_response(200, value)
                return
            if url.path.startswith("/api/") or root is None:
                raise ApiError(404, "NOT_FOUND", "接口不存在。")
            path = unquote(url.path)
            if "\\" in path or "\x00" in path or ".." in Path(path).parts:
                raise ApiError(404, "NOT_FOUND", "页面不存在。")
            target = (root / path.lstrip("/")).resolve()
            if root not in target.parents and target != root:
                raise ApiError(404, "NOT_FOUND", "页面不存在。")
            if target.is_dir():
                target = target / "index.html"
            if not target.is_file() and not target.suffix:
                target = root / "index.html"
            target = target.resolve()
            if root not in target.parents and target != root:
                raise ApiError(404, "NOT_FOUND", "页面不存在。")
            if not target.is_file():
                raise ApiError(404, "NOT_FOUND", "页面不存在。")
            payload = target.read_bytes()
            self.send_response(200)
            self.send_header("Content-Type", mimetypes.guess_type(str(target))[0] or "application/octet-stream")
            self.send_header("X-Content-Type-Options", "nosniff")
            self.send_header("Cache-Control", "no-cache")
            self.send_header("Content-Length", str(len(payload)))
            self.end_headers()
            self.wfile.write(payload)

        def do_POST(self) -> None:
            self.guarded(self.post_route)

        def post_route(self) -> None:
            if self.headers.get("Origin") and self.headers["Origin"] not in allowed_origins:
                raise ApiError(403, "INVALID_ORIGIN", "请求来源不受支持。")
            if self.headers.get("Transfer-Encoding"):
                self.close_connection = True
                invalid("请求需要提供内容长度。")
            if self.headers.get("Content-Type", "").split(";")[0].strip().lower() != "application/json":
                raise ApiError(415, "INVALID_REQUEST", "请求需要使用 JSON 格式。")
            try:
                length = int(self.headers.get("Content-Length", ""))
            except ValueError:
                raise ApiError(411, "INVALID_REQUEST", "请求需要提供内容长度。") from None
            if length <= 0:
                invalid("请求内容不能为空。")
            if length > MAX_JSON_BYTES:
                self.close_connection = True
                raise ApiError(413, "INVALID_REQUEST", "请求内容过长。")
            body = parse_json_body(self.rfile.read(length))
            url = urlsplit(self.path)
            if url.query:
                invalid("正式接口不接受演示或测试参数。")
            path = url.path
            if path == "/api/decision":
                self.json_response(200, gateway.decide(body))
            elif path == "/api/decision/stress":
                self.json_response(200, gateway.stress(body))
            else:
                raise ApiError(404, "NOT_FOUND", "接口不存在。")

    return Handler


def main() -> None:
    parser = argparse.ArgumentParser(description="AgriScope Final Model / Daily read-only API")
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=8787)
    parser.add_argument("--workspace-root", type=Path, default=Path(os.environ.get("AG_SCOPE_WORKSPACE_ROOT", Path(__file__).resolve().parents[2])))
    parser.add_argument("--frontend", type=Path, help="Optional built frontend directory (dist)")
    parser.add_argument("--allow-origin", action="append", default=[], help="Allowed browser origin, when serving through a proxy")
    args = parser.parse_args()
    origins = tuple(args.allow_origin + [f"http://localhost:{args.port}", f"http://127.0.0.1:{args.port}"])
    server = ThreadingHTTPServer((args.host, args.port), make_handler(Gateway(args.workspace_root), args.frontend, origins))
    server.daemon_threads = True
    print(f"AgriScope API listening on http://{args.host}:{args.port}", flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
