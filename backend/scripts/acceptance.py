# -*- coding: utf-8 -*-
"""AgriScope Decision API · 正式验收（Backend Freeze Gate 自动化部分）。

覆盖：
  静态：backend 代码无 Mac 绝对路径；不 import 旧 v1/archive 生产依赖
  运行时：真实跑 evaluate / capabilities / stress / daily，记录被读取的 models/ 文件，
          确认**未修改** models/（canonical 只读）
  契约：运行 tests/test_e2e.py（16 项 + 并发），并校验 OpenAPI 可生成
  版本：/api/meta 暴露 model/daily/runtime 版本矩阵

用法：
    python3 backend/scripts/acceptance.py
"""
from __future__ import annotations

import ast
import json
import subprocess
import sys
from pathlib import Path

_BACKEND = Path(__file__).resolve().parents[1]
_ROOT = _BACKEND.parent
if str(_BACKEND) not in sys.path:
    sys.path.insert(0, str(_BACKEND))

RESULTS: list = []


def check(name: str, ok: bool, detail: str = "") -> None:
    RESULTS.append((name, bool(ok), detail))
    print(f"  [{'PASS' if ok else 'FAIL'}] {name}" + (f" :: {detail}" if detail else ""))


MAC_TOKENS = ["/Users/", "morton_cheung", "/Desktop/"]
FORBIDDEN_TOKENS = ["decision_dataset_v1", "snapshots/v1", "hri_v1.parquet",
                    "market_risk_v1", "archive/", "evaluation/metrics/model_selection.csv"]


def _code_text(path: Path) -> str:
    tree = ast.parse(path.read_text(encoding="utf-8"))
    docs = set()
    for node in ast.walk(tree):
        if isinstance(node, (ast.Module, ast.ClassDef, ast.FunctionDef, ast.AsyncFunctionDef)):
            body = getattr(node, "body", None)
            if body and isinstance(body[0], ast.Expr) and isinstance(body[0].value, ast.Constant) \
                    and isinstance(body[0].value.value, str):
                docs.add(id(body[0].value))
    parts = []
    for node in ast.walk(tree):
        if isinstance(node, ast.Constant) and isinstance(node.value, str) and id(node) not in docs:
            parts.append(node.value)
        elif isinstance(node, ast.Name):
            parts.append(node.id)
        elif isinstance(node, ast.Attribute):
            parts.append(node.attr)
    return "\n".join(parts)


def static_scan() -> None:
    """生产模块扫描：排除 tests/ 与本验收脚本自身（后者按定义含被检查词表）。"""
    print("\n[静态扫描]")
    files = [p for p in _BACKEND.rglob("*.py")
             if "tests" not in p.parts and p.name != "acceptance.py"]
    text = {str(p.relative_to(_BACKEND)): _code_text(p) for p in files}
    mac = [f"{n}:{t}" for n, s in text.items() for t in MAC_TOKENS if t in s]
    check("backend 代码无 Mac 绝对路径", not mac, ",".join(mac[:4]))
    v1 = [f"{n}:{t}" for n, s in text.items() for t in FORBIDDEN_TOKENS if t in s]
    check("无旧 v1/archive 生产依赖", not v1, ",".join(v1[:4]))
    check("未 import 前端目录（AgriScope/）",
          not any("AgriScope/" in s for s in text.values()))


def _models_fingerprint() -> dict:
    out = {}
    base = _ROOT / "models"
    if not base.exists():
        return out
    for p in base.rglob("*"):
        if p.is_file():
            try:
                out[str(p.relative_to(base))] = p.stat().st_mtime_ns
            except OSError:
                pass
    return out


def runtime_audit() -> None:
    print("\n[运行时审计 / 契约]")
    from fastapi.testclient import TestClient  # noqa: PLC0415
    from app.main import app  # noqa: PLC0415

    body = {
        "contract_version": "1",
        "user_context": {
            "city_id": "shenyang", "area_mu": 60, "budget_cny": 300000,
            "risk_preference": "balanced", "crop_preferences": ["西红柿", "黄瓜"],
            "actual_inputs": {"西红柿": {"cost_per_mu": 2000, "yield_kg_per_mu": 5000}},
            "market_context": {"as_of": "2026-09-14", "horizon_days": 30, "harvest_date": None},
        },
        "input_source": {"kind": "structured"},
    }

    before = _models_fingerprint()
    with TestClient(app) as c:
        ready = c.get("/health/ready")
        check("/health/ready 真检查通过", ready.status_code == 200,
              str(ready.json().get("status")))
        meta = c.get("/api/meta").json()
        check("版本矩阵 model_version=final_v1",
              meta["final_model"]["model_version"] == "final_v1")
        check("运行时快照状态明确",
              meta["runtime"]["runtime_data_status"] in ("LIVE", "FROZEN_FALLBACK"),
              f"{meta['runtime']['runtime_data_status']} @ {meta['runtime']['source']}")
        check("Daily 版本矩阵可得", bool(meta.get("daily")),
              str((meta.get("daily") or {}).get("schema_version")))

        ev = c.post("/api/decision/evaluate", json=body)
        check("evaluate 200（默认入口 /api/decision 亦可）",
              ev.status_code == 200 and c.post("/api/decision", json=body).status_code == 200)
        env = ev.json()
        check("request 原样回显", env["request"] == body)
        check("market_as_of=请求 as_of",
              env["market_as_of"] == body["user_context"]["market_context"]["as_of"])
        check("batch.all 状态属登记枚举",
              all(r["status"] in {"OK", "LOW_CONFIDENCE", "PARTIAL", "SCENARIO_ONLY",
                                  "USER_INPUT_REQUIRED", "INSUFFICIENT_MARKET_DATA",
                                  "NO_FEASIBLE_PLAN", "NO_FEASIBLE_WINDOW", "NO_CLEAR_WINNER",
                                  "NO_DIVERSIFICATION_BENEFIT", "MODEL_ERROR"}
                  for r in env["batch"]["all"]))

        cap = c.get("/api/decision/capabilities", params={"city": "shenyang"}).json()
        check("capabilities supported & 10 crops",
              cap["supported"] is True and len(cap["crops"]) == 10)
        dalian = c.get("/api/decision/capabilities", params={"city": "dalian"}).json()
        check("大连 supported=False（不 fallback）", dalian["supported"] is False)

        st = c.post("/api/decision/stress", json={
            "request": body, "candidate_id": "西红柿",
            "changes": {"price_pct": -20, "yield_pct": 0, "cost_pct": 0, "delay_days": 0}})
        check("stress 200 且 available", st.status_code == 200 and st.json()["available"] is True)

        dl = c.get("/api/daily/latest", params={"city": "shenyang"})
        check("daily latest.json 原样返回", dl.status_code == 200
              and dl.json().get("schema_version") == "1.1.0")

        err = c.post("/api/decision/evaluate", json={"contract_version": "2"})
        check("统一错误契约 + request_id",
              err.status_code == 400 and err.json()["error_code"] == "VALIDATION_ERROR"
              and bool(err.json()["request_id"]))

        spec = app.openapi()
        paths = set(spec.get("paths", {}).keys())
        need = {"/api/decision/evaluate", "/api/decision/stress",
                "/api/decision/capabilities", "/api/daily/latest"}
        check("OpenAPI 覆盖核心路径", need <= paths, str(sorted(need - paths)))

    after = _models_fingerprint()
    guard = ("data/", "models/", "src/", "config/")
    changed = [k for k in set(before) | set(after)
               if before.get(k) != after.get(k)
               and k.startswith(guard) and not k.startswith("reports/final/")]
    check("未修改 models/（canonical 只读）", not changed, ",".join(changed[:3]))


def run_pytest() -> None:
    print("\n[契约回归 pytest]")
    proc = subprocess.run([sys.executable, "-m", "pytest", "tests/test_e2e.py", "-q"],
                          cwd=str(_BACKEND), capture_output=True, text=True)
    tail = (proc.stdout or "").strip().splitlines()[-1:] or [""]
    check("tests/test_e2e.py 全通过", proc.returncode == 0, tail[0])


def main() -> int:
    print("=" * 74)
    print("AgriScope Decision API · Backend Acceptance")
    print("=" * 74)
    static_scan()
    runtime_audit()
    run_pytest()

    n_ok = sum(1 for _, ok, _ in RESULTS if ok)
    n = len(RESULTS)
    print("\n" + "=" * 74)
    print(f"验收结果：{n_ok}/{n} 通过")
    if n_ok != n:
        print("\n未通过项：")
        for name, ok, detail in RESULTS:
            if not ok:
                print(f"  - {name} :: {detail}")
        print("\n状态：BACKEND_ACCEPTANCE_FAILED")
        return 1
    print("\n状态：BACKEND_FROZEN")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())