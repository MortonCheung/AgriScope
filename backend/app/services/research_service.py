# -*- coding: utf-8 -*-
"""研究中心只读服务：把 `pipelines/publishing` 发布的六城研究产物暴露为最小只读契约。

硬约束（研究层语义，违反即为产品缺陷）：
  - **只读**：绝不改写研究结论、指标、来源；本模块不做任何计算或推断，只做路径解析与透传；
  - **路径白名单**：城市、文章 id、文件名的形态全部由正则约束，再叠加「解析后必须落在
    product 根目录内」的二次校验，杜绝任意路径读取（`..`、绝对路径、编码绕过）；
  - **禁止伪造**：文件不存在就返回 NOT_FOUND，不补齐、不回退到别的城市。

数据流：`data/research` → `pipelines/publishing` → `runtime/research/product/<city>` → 本服务。
"""
from __future__ import annotations

import csv
import io
import json
import re
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

from .. import config as C
from ..errors import ApiError, ErrorCode

RESEARCH_DIR = C.RUNTIME_DIR / "research"
PRODUCT_ROOT = RESEARCH_DIR / "product"
CATALOG_PATH = RESEARCH_DIR / "research_catalog.json"

# LLM 回溯评估产物（真实 LLM 评估报告的机器可读落点，只读）。
# 与 `runtime/research` 发布链相互独立：这里直接读评估侧产物，不做任何补偿或重算。
#
# 路径顺序（§5.1/§6.4）：**先读正式发布快照 `runtime/llm/artifacts/v2`**，
# 使独立运行（只拿 AgriScope/ 目录）时该端点可用；开发机上尚未 publish 时
# 回退到仓内 `llm/artifacts/v2`（两者都在 AgriScope 内，不依赖外层 data/models）。
LLM_ARTIFACTS_CANDIDATES: Tuple[Path, ...] = (
    C.RUNTIME_DIR / "llm" / "artifacts" / "v2",
    C.ROOT / "llm" / "artifacts" / "v2",
)
LLM_STATUS_FILE = "real_evaluation_status.json"
LLM_OUTCOME_FILE = "outcome_labels.json"
LLM_FAIR_FILE = "fair_comparison.csv"


def llm_artifacts_dir() -> Path:
    """返回实际存在的产物目录（优先正式发布快照）。"""
    for candidate in LLM_ARTIFACTS_CANDIDATES:
        if candidate.is_dir():
            return candidate
    return LLM_ARTIFACTS_CANDIDATES[0]

# 公平对比表：变体 → CSV 列名（口径与评估侧一致，逐字沿用）。
LLM_VARIANT_COLUMNS: Tuple[Tuple[str, str], ...] = (
    ("baseline", "baseline_WAPE"),
    ("statistical_seasonal", "statistical_seasonal_WAPE"),
    ("llm_blind", "llm_blind_WAPE"),
    ("llm_context", "llm_context_WAPE"),
    ("llm_residual", "llm_residual_WAPE"),
    ("hybrid_A", "hybrid_A_WAPE"),
    ("hybrid_B", "hybrid_B_WAPE"),
    ("hybrid_C", "hybrid_C_WAPE"),
)

# 治理红线（来自 RC3_FINAL_REPORT.md §6）：独立未来验证起点不得早于该日期。
PROSPECTIVE_VALIDATION_NOT_BEFORE = "2026-10-08"

# 路径白名单：只允许小写字母/下划线城市 id；文章 id 形如 A01；文件名禁止斜杠与点号穿越。
CITY_RE = re.compile(r"^[a-z][a-z_]{1,19}$")
ARTICLE_RE = re.compile(r"^A\d{2,3}$")
FILE_RE = re.compile(r"^[A-Za-z0-9][A-Za-z0-9_.\-]{0,79}\.(csv|png|jpg|jpeg|svg|webp)$")

MEDIA_TYPES = {
    ".csv": "text/csv; charset=utf-8",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".svg": "image/svg+xml",
    ".webp": "image/webp",
}

_CATALOG_CACHE: Optional[Dict[str, Any]] = None
_CITIES_CACHE: Optional[List[str]] = None


def _not_found(message: str, details: Optional[Dict[str, Any]] = None) -> ApiError:
    return ApiError(404, ErrorCode.NOT_FOUND, message, details)


def _inside(root: Path, candidate: Path) -> bool:
    """解析后必须位于 root 之内（软链同样要求落在 root 内）。"""
    try:
        resolved = candidate.resolve()
    except OSError:
        return False
    return resolved == root or root in resolved.parents


def catalog() -> Dict[str, Any]:
    """轻量研究总索引。不存在时明确报错，不做任何回退或占位。"""
    global _CATALOG_CACHE
    if _CATALOG_CACHE is None:
        if not CATALOG_PATH.is_file():
            raise ApiError(503, ErrorCode.RESEARCH_UNAVAILABLE,
                           "研究索引尚未发布。",
                           {"hint": "运行 pipelines/publishing/publish_research.py"})
        try:
            _CATALOG_CACHE = json.loads(CATALOG_PATH.read_text(encoding="utf-8"))
        except (OSError, ValueError):
            _CATALOG_CACHE = None
            raise ApiError(503, ErrorCode.RESEARCH_UNAVAILABLE, "研究索引不可解析。")
    return _CATALOG_CACHE


def reset_cache() -> None:
    """测试用：清空进程内缓存。"""
    global _CATALOG_CACHE, _CITIES_CACHE
    _CATALOG_CACHE = None
    _CITIES_CACHE = None


def city_ids() -> List[str]:
    """以**已发布索引**为准的城市清单；索引缺失时回退到目录扫描。"""
    global _CITIES_CACHE
    if _CITIES_CACHE is None:
        try:
            _CITIES_CACHE = [str(item["city"]) for item in catalog().get("cities", [])]
        except ApiError:
            _CITIES_CACHE = sorted(p.name for p in PRODUCT_ROOT.iterdir()
                                   if p.is_dir()) if PRODUCT_ROOT.is_dir() else []
    return _CITIES_CACHE


def cities() -> Dict[str, Any]:
    """城市清单 + 每城模块概况（供研究中心首页使用，不含正文）。"""
    data = catalog()
    return {
        "n_cities": data.get("n_cities", len(data.get("cities", []))),
        "n_modules": data.get("n_modules"),
        "cities": [
            {
                "city": item.get("city"),
                "city_name": item.get("city_name"),
                "n_modules": item.get("n_modules"),
                "n_sources": item.get("n_sources"),
                "modules": [
                    {key: module.get(key) for key in
                     ("module_id", "title", "status", "summary", "explorer_available")}
                    for module in item.get("modules", [])
                ],
            }
            for item in data.get("cities", [])
        ],
    }


def _city_root(city: str) -> Path:
    if not CITY_RE.match(city):
        raise ApiError(400, ErrorCode.BAD_REQUEST, "非法城市标识。", {"city": city})
    if city not in city_ids():
        raise ApiError(404, ErrorCode.NOT_FOUND, "该城市暂无已发布研究。", {"city": city})
    root = PRODUCT_ROOT / city
    if not _inside(PRODUCT_ROOT, root) or not root.is_dir():
        raise ApiError(404, ErrorCode.NOT_FOUND, "该城市暂无已发布研究。", {"city": city})
    return root


def _read_json(path: Path, message: str) -> Dict[str, Any]:
    if not path.is_file():
        raise _not_found(message, {"name": path.name})
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        raise ApiError(503, ErrorCode.RESEARCH_UNAVAILABLE, "研究文件不可解析。", {"name": path.name})


def manifest(city: str) -> Dict[str, Any]:
    return _read_json(_city_root(city) / "manifest.json", "该城市研究清单不存在。")


def sources(city: str) -> List[Dict[str, Any]]:
    payload = _read_json(_city_root(city) / "sources.json", "该城市来源清单不存在。")
    return payload if isinstance(payload, list) else []


def sync_report(city: str) -> Dict[str, Any]:
    return _read_json(_city_root(city) / "sync-report.json", "该城市同步报告不存在。")


def article(city: str, article_id: str) -> Dict[str, Any]:
    if not ARTICLE_RE.match(article_id):
        raise ApiError(400, ErrorCode.BAD_REQUEST, "非法文章标识。", {"article_id": article_id})
    return _read_json(_city_root(city) / "articles" / f"{article_id}.json", "该研究模块暂不可用。")


def references(city: str) -> str:
    path = _city_root(city) / "references.md"
    if not path.is_file():
        raise _not_found("该城市未提供来源与参考文献清单。", {"city": city})
    try:
        return path.read_text(encoding="utf-8")
    except OSError:
        raise ApiError(503, ErrorCode.RESEARCH_UNAVAILABLE, "来源清单不可读。", {"city": city})


def _asset(city: str, folder: str, file: str) -> Tuple[Path, str]:
    if not FILE_RE.match(file):
        raise ApiError(400, ErrorCode.BAD_REQUEST, "非法文件名。", {"file": file})
    path = _city_root(city) / folder / file
    if not _inside(PRODUCT_ROOT, path) or not path.is_file():
        raise _not_found("该研究素材不存在。", {"city": city, "file": file})
    media = MEDIA_TYPES.get(path.suffix.lower(), "application/octet-stream")
    return path, media


def table(city: str, file: str) -> Tuple[Path, str]:
    return _asset(city, "tables", file)


def figure(city: str, file: str) -> Tuple[Path, str]:
    return _asset(city, "figures", file)


# ---------------------------------------------------------------- LLM 回溯评估证据
def _llm_artifact(name: str) -> Path:
    directory = llm_artifacts_dir()
    path = directory / name
    if not path.is_file():
        raise ApiError(503, ErrorCode.RESEARCH_UNAVAILABLE,
                       "LLM 回溯评估产物不存在，无法提供证据。",
                       {"missing": name, "searched": ["runtime/llm/artifacts/v2", "llm/artifacts/v2"]})
    return path


def _llm_json(name: str) -> Dict[str, Any]:
    try:
        payload = json.loads(_llm_artifact(name).read_text(encoding="utf-8"))
    except (OSError, ValueError):
        raise ApiError(503, ErrorCode.RESEARCH_UNAVAILABLE,
                       "LLM 回溯评估产物不可解析。", {"name": name})
    if not isinstance(payload, dict):
        raise ApiError(503, ErrorCode.RESEARCH_UNAVAILABLE,
                       "LLM 回溯评估产物结构异常。", {"name": name})
    return payload


def _llm_fair_comparison() -> Dict[str, Any]:
    """逐列汇总公平对比表：各变体相对 baseline 的 WAPE 与增益（unweighted row mean）。

    只做列到变体的直接映射与均值汇总，不改写任何单行数值、不重算指标口径。
    """
    try:
        text = _llm_artifact(LLM_FAIR_FILE).read_text(encoding="utf-8")
    except OSError:
        raise ApiError(503, ErrorCode.RESEARCH_UNAVAILABLE,
                       "LLM 公平对比表不可读。", {"name": LLM_FAIR_FILE})
    rows = list(csv.DictReader(io.StringIO(text)))
    means: Dict[str, Tuple[Optional[float], int]] = {}
    for variant, column in LLM_VARIANT_COLUMNS:
        values: List[float] = []
        for row in rows:
            raw = (row.get(column) or "").strip()
            if not raw:
                continue
            try:
                values.append(float(raw))
            except ValueError:
                continue
        means[variant] = ((sum(values) / len(values)) if values else None, len(values))
    baseline_mean, _ = means.get("baseline", (None, 0))
    variants: List[Dict[str, Any]] = []
    for variant, _column in LLM_VARIANT_COLUMNS:
        mean, n = means[variant]
        gain = None
        if mean is not None and baseline_mean is not None:
            gain = round(baseline_mean - mean, 4)
        variants.append({
            "variant": variant,
            "mean_wape": round(mean, 4) if mean is not None else None,
            "n": n,
            "gain_pp_vs_baseline": gain,
        })
    return {
        "metric": "WAPE",
        "aggregation": "unweighted mean over fair_comparison.csv rows (variant cell non-empty)",
        "rows": len(rows),
        "variants": variants,
        "note": "reused retrospective pilot; RESEARCH_ONLY; not production-admissible",
    }


def llm_evaluation() -> Dict[str, Any]:
    """真实 LLM 回溯评估证据：由评估侧机器可读产物派生的小 JSON（只读、不伪造）。

    产物缺失或不可解析时返回 503 RESEARCH_UNAVAILABLE，绝不回退到占位数据。
    只输出 provider 的 provider/model/is_real_llm，**刻意排除 base_url 与任何密钥字段**。
    """
    status = _llm_json(LLM_STATUS_FILE)
    outcomes = _llm_json(LLM_OUTCOME_FILE)
    fair = _llm_fair_comparison()
    provider = status.get("provider") if isinstance(status.get("provider"), dict) else {}
    return {
        "status": status.get("status"),
        "evidence_status": status.get("evidence_status"),
        "outcome_labels": outcomes,
        "fair_comparison": fair,
        "provider": {
            "provider": provider.get("provider"),
            "model": provider.get("model"),
            "is_real_llm": provider.get("is_real_llm"),
        },
        "final_effective_n": status.get("final_effective_n"),
        "untouched_period": status.get("untouched_period"),
        "production_eligible": bool(status.get("llm_production")),
        "independent_validation": {
            "status": "PROSPECTIVE_VALIDATION_PENDING_BY_TIME",
            "not_before": PROSPECTIVE_VALIDATION_NOT_BEFORE,
            "untouched_period": status.get("untouched_period"),
        },
        "artifacts_found": [
            f"llm/artifacts/v2/{name}"
            for name in (LLM_STATUS_FILE, LLM_OUTCOME_FILE, LLM_FAIR_FILE)
        ],
    }