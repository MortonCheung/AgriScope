# -*- coding: utf-8 -*-
"""研究中心只读 API 契约测试（路径白名单 + 真实产物一致性）。

若 `runtime/research/product` 尚未发布（该目录被 .gitignore 忽略），
测试会 skip 并给出发布命令，而不是伪造通过。
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

_BACKEND = Path(__file__).resolve().parents[1]
if str(_BACKEND) not in sys.path:
    sys.path.insert(0, str(_BACKEND))

from app.main import app  # noqa: E402
from app.services import research_service as R  # noqa: E402

CITIES = ["shenyang", "chaoyang", "jinzhou", "dalian", "dandong", "tieling", "cross_city"]


@pytest.fixture(scope="module")
def client():
    if not R.PRODUCT_ROOT.is_dir():
        pytest.skip("研究产物未发布：运行 python3 pipelines/publishing/publish_research.py")
    R.reset_cache()
    with TestClient(app) as c:
        yield c


def test_catalog_lists_seven_published_directories(client):
    body = client.get("/api/research/catalog").json()
    assert body["n_cities"] == len(CITIES)
    assert {c["city"] for c in body["cities"]} == set(CITIES)
    assert body["n_modules"] >= 54


def test_cities_endpoint_is_lightweight(client):
    body = client.get("/api/research/cities").json()
    assert len(body["cities"]) == len(CITIES)
    first = body["cities"][0]
    assert {"city", "city_name", "n_modules", "modules"} <= set(first)
    module = first["modules"][0]
    assert set(module) == {"module_id", "title", "status", "summary", "explorer_available"}


def test_manifest_matches_actual_article_count(client):
    for city in CITIES:
        manifest = client.get(f"/api/research/{city}/manifest.json").json()
        assert manifest["n_articles"] == len(manifest["articles"]), city
        for entry in manifest["articles"]:
            assert entry["title"]
            assert entry["status"]


def test_article_payload_is_byte_identical_to_published_source(client):
    for city, article_id in (("chaoyang", "A03"), ("tieling", "A07"), ("cross_city", "A11")):
        served = client.get(f"/api/research/{city}/articles/{article_id}.json").json()
        raw = (R.PRODUCT_ROOT / city / "articles" / f"{article_id}.json").read_text(encoding="utf-8")
        assert served == json.loads(raw), f"{city}/{article_id}"


def test_explorer_metadata_survives_the_hop(client):
    chaoyang = client.get("/api/research/chaoyang/articles/A03.json").json()
    assert isinstance(chaoyang.get("explorer"), dict)
    # 沈阳历史载荷没有 explorer：必须如实为空，不允许补齐或伪造
    shenyang = client.get("/api/research/shenyang/articles/A03.json").json()
    assert "explorer" not in shenyang


def test_sources_and_sync_report(client):
    sources = client.get("/api/research/chaoyang/sources.json").json()
    assert isinstance(sources, list) and sources
    assert {"source_id", "title", "url"} <= set(sources[0])
    report = client.get("/api/research/chaoyang/sync-report.json").json()
    assert report["counts"]["articles"] >= 9


def test_references_is_plain_text(client):
    response = client.get("/api/research/shenyang/references.md")
    assert response.status_code == 200
    assert response.headers["content-type"].startswith("text/plain")


def test_tables_and_figures_are_served_with_real_media_types(client):
    manifest = client.get("/api/research/chaoyang/manifest.json").json()
    article_id = manifest["articles"][0]["id"]
    article = client.get(f"/api/research/chaoyang/articles/{article_id}.json").json()
    tables = article.get("tables") or []
    if tables:
        response = client.get(f"/api/research/chaoyang/tables/{tables[0]['file']}")
        assert response.status_code == 200
        assert response.headers["content-type"].startswith("text/csv")
    figures = article.get("figures") or []
    if figures:
        response = client.get(f"/api/research/chaoyang/figures/{figures[0]['file']}")
        assert response.status_code == 200
        assert response.headers["content-type"].startswith("image/")


@pytest.mark.parametrize("path,expected", [
    ("/api/research/../../etc/passwd/manifest.json", (400, 404)),
    ("/api/research/shenyang/manifest.json", (200,)),
    ("/api/research/notacity/manifest.json", (404,)),
    ("/api/research/Shenyang/manifest.json", (400, 404)),
    ("/api/research/shenyang/articles/XX.json", (400,)),
    ("/api/research/shenyang/articles/A01.txt", (400, 404)),
    ("/api/research/shenyang/tables/..%2F..%2Fmanifest.json", (400, 404)),
    ("/api/research/shenyang/tables/evil.sh", (400, 404)),
    ("/api/research/shenyang/figures/missing.png", (404,)),
])
def test_path_whitelist_rejects_anything_outside_the_published_product(client, path, expected):
    response = client.get(path)
    assert response.status_code in expected, f"{path} -> {response.status_code}"


def test_service_layer_rejects_raw_traversal_strings(client):
    """HTTP 客户端会先归一化 `..`，因此穿越防护必须在**服务层**被真实断言。

    参考：`/api/research/shenyang/articles/../manifest.json` 会被 httpx 归一化成合法路径，
    这条用例绕过传输层，直接把恶意串交给服务函数。
    """
    from app.errors import ApiError

    cases = [
        lambda: R.manifest("../../.."),
        lambda: R.manifest("shenyang/../.."),
        lambda: R.article("shenyang", "../../../etc/passwd"),
        lambda: R.article("shenyang", ".."),
        lambda: R.table("shenyang", "../../manifest.json"),
        lambda: R.table("shenyang", "/etc/passwd"),
        lambda: R.figure("shenyang", "figures/../../manifest.json"),
        lambda: R.figure("shenyang", "a.png/../../b.png"),
    ]
    for call in cases:
        with pytest.raises(ApiError) as excinfo:
            call()
        assert excinfo.value.status_code in (400, 404), call


def test_error_envelope_is_the_shared_contract(client):
    body = client.get("/api/research/notacity/manifest.json").json()
    assert set(body) == {"error_code", "message", "request_id", "details"}
    assert body["error_code"] == "NOT_FOUND"


# ---------------------------------------------------------------- LLM 回溯评估证据
LLM_ARTIFACTS = [
    "llm/artifacts/v2/real_evaluation_status.json",
    "llm/artifacts/v2/outcome_labels.json",
    "llm/artifacts/v2/fair_comparison.csv",
]


@pytest.fixture(scope="module")
def llm_client():
    if not R.LLM_ARTIFACTS_DIR.is_dir():
        pytest.skip("LLM 回溯评估产物未生成：llm/artifacts/v2/")
    with TestClient(app) as c:
        yield c


def test_llm_evaluation_is_derived_from_real_artifacts(llm_client):
    body = llm_client.get("/api/research/llm-evaluation").json()
    status = json.loads((R.LLM_ARTIFACTS_DIR / R.LLM_STATUS_FILE).read_text(encoding="utf-8"))
    outcomes = json.loads((R.LLM_ARTIFACTS_DIR / R.LLM_OUTCOME_FILE).read_text(encoding="utf-8"))

    assert body["status"] == status["status"] == "REAL_LLM_EVALUATED_RETROSPECTIVE_ONLY"
    assert body["evidence_status"] == "RETROSPECTIVE_ONLY_NO_UNTOUCHED"
    assert body["final_effective_n"] == 0
    assert body["production_eligible"] is False
    # 结论标签必须与产物逐字一致，不做任何改写
    assert body["outcome_labels"] == outcomes
    assert outcomes["llm"] == "LLM_RETROSPECTIVE_GAIN_OBSERVED"
    assert outcomes["hybrid"] == "HYBRID_NO_GAIN_STATISTICAL_FALLBACK_ACTIVE"
    assert outcomes["llm_blind_gain_pp"] < 0
    assert outcomes["llm_context_gain_pp"] > 0
    assert outcomes["llm_residual_gain_pp"] < 0
    assert outcomes["hybrid_best_gain_pp"] == 0.0
    # provider 只暴露非敏感字段
    assert body["provider"] == {
        "provider": status["provider"]["provider"],
        "model": status["provider"]["model"],
        "is_real_llm": status["provider"]["is_real_llm"],
    }
    assert set(body["artifacts_found"]) == set(LLM_ARTIFACTS)
    # 公平对比表逐项来自真实 CSV
    variants = {v["variant"]: v for v in body["fair_comparison"]["variants"]}
    assert body["fair_comparison"]["metric"] == "WAPE"
    assert body["fair_comparison"]["rows"] > 0
    assert variants["baseline"]["gain_pp_vs_baseline"] == 0.0
    assert variants["baseline"]["mean_wape"] is not None
    assert variants["llm_blind"]["mean_wape"] is not None
    assert variants["llm_context"]["mean_wape"] is not None
    # 独立未来验证起点不得早于治理日期
    assert body["independent_validation"]["status"] == "PROSPECTIVE_VALIDATION_PENDING_BY_TIME"
    assert body["independent_validation"]["not_before"] == "2026-10-08"


def test_llm_evaluation_never_leaks_keys_or_base_url(llm_client):
    response = llm_client.get("/api/research/llm-evaluation")
    assert response.status_code == 200
    raw = response.text.lower()
    assert "sk-" not in raw
    assert "base_url" not in raw
    assert "api_key" not in raw and "apikey" not in raw
    assert "secret" not in raw


def test_llm_evaluation_returns_503_when_artifacts_missing(monkeypatch, tmp_path):
    monkeypatch.setattr(R, "LLM_ARTIFACTS_DIR", tmp_path / "absent")
    with TestClient(app) as c:
        response = c.get("/api/research/llm-evaluation")
    assert response.status_code == 503
    body = response.json()
    assert set(body) == {"error_code", "message", "request_id", "details"}
    assert body["error_code"] == "RESEARCH_UNAVAILABLE"
    assert body["details"]["missing"], "应指明缺失的产物"