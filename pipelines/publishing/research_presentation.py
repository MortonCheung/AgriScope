"""Deterministic, read-only publication audit. Never changes scientific payloads."""
from __future__ import annotations

import csv
import hashlib
import json
import math
from pathlib import Path
from typing import Any

PRESENTATION_VERSION = "final-1"
POLICY_PATH = Path(__file__).with_name("research_presentation_policy.json")
TREE_PATH = Path(__file__).resolve().parents[2] / "frontend/src/domain/research/catalog/shenyang-tree.json"


def digest(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def finite_number(value: Any) -> float | None:
    if value is None or not str(value).strip():
        return None
    try:
        number = float(value)
    except (TypeError, ValueError):
        return None
    return number if math.isfinite(number) else None


def canonical_id(value: str) -> str:
    head, dot, tail = value.partition(".")
    if head.startswith("A") and head[1:].isdigit():
        head = f"A{int(head[1:])}"
    return head + (dot + tail if dot else "")


def csv_rows(path: Path) -> tuple[list[str], list[dict[str, str]]]:
    with path.open(encoding="utf-8-sig", newline="") as stream:
        reader = csv.DictReader(stream)
        rows = list(reader)
        return reader.fieldnames or [], rows


def curated_topic(tree: dict, module_id: str) -> dict | None:
    return next((topic for topic in tree.get("topics", [])
                 if canonical_id(topic["articleId"]) == canonical_id(module_id)), None)


def source_hashes(city: str, article: dict, product_root: Path, tree: dict, dependencies: list[str]) -> dict[str, str]:
    base = product_root / city
    paths = {f"articles/{article['id']}.json", "sources.json"}
    paths.update(f"tables/{item['file']}" for item in article.get("tables", []))
    paths.update(f"figures/{item['file']}" for item in article.get("figures", []))
    paths.update(f"tables/{item['table']}" for item in (article.get("explorer") or {}).get("series", []) if item.get("table"))
    topic = curated_topic(tree, article["id"]) if city == "shenyang" else None
    if topic:
        for binding in [*(topic.get("explorers") or []), *(point.get("binding") for point in topic.get("points", []) if point.get("binding"))]:
            paths.add(f"tables/{binding['table']}")
            paths.update(f"tables/{name}" for name in binding.get("companions", []))
    hashes = {name: digest(base / name) for name in sorted(paths) if (base / name).is_file()}
    if topic:
        # Curated bindings and scientific quotations are part of the reviewed package too.
        encoded = json.dumps(topic, sort_keys=True, separators=(",", ":")).encode()
        hashes[f"curated/shenyang-tree.json#{canonical_id(article['id'])}"] = hashlib.sha256(encoded).hexdigest()
    for dependency in sorted(dependencies):
        path = product_root / dependency / "sources.json"
        if path.is_file():
            hashes[f"dependency/{dependency}/sources.json"] = digest(path)
    return hashes


def fingerprint(hashes: dict[str, str]) -> str:
    return hashlib.sha256(json.dumps(hashes, sort_keys=True, separators=(",", ":")).encode()).hexdigest()


def validate_series(base: Path, item: dict, index: int, city: str) -> tuple[dict | None, str | None]:
    table, x, y = item.get("table"), item.get("x"), item.get("y")
    if not table or not x or not y or Path(table).name != table:
        return None, "invalid_series_binding"
    path = base / "tables" / table
    if not path.is_file():
        return None, "missing_series_table"
    columns, rows = csv_rows(path)
    selectors = list(dict.fromkeys(value for value in [item.get("group"), item.get("facet"), *item.get("selectors", [])] if value))
    # A comparison pair is identified by both cities; this only selects existing rows.
    if city == "cross_city" and table == "cross_city_seasonal_sync.csv" and "city_a" not in selectors:
        selectors.append("city_a")
    if any(column not in columns for column in [x, y, *selectors]):
        return None, "missing_series_column"
    fixed = item.get("filter", {})
    if any(column not in columns for column in fixed):
        return None, "missing_filter_column"
    rows = [row for row in rows if all(row.get(column, "") in values for column, values in fixed.items())]
    numeric = [row for row in rows if (row.get(x) or "").strip() and finite_number(row.get(y)) is not None]
    if not numeric:
        return None, "empty_numeric_series"
    all_groups = {tuple(row.get(column, "") for column in selectors) for row in rows}
    numeric_groups = {tuple(row.get(column, "") for column in selectors) for row in numeric}
    if all_groups != numeric_groups:
        return None, "empty_selector_group"
    groups: dict[tuple, list[dict]] = {}
    for row in numeric:
        groups.setdefault(tuple(row.get(column, "") for column in selectors), []).append(row)
    if any(len({row[x] for row in group}) != len(group) for group in groups.values()):
        return None, "ambiguous_category"
    for row in numeric:
        low, high = finite_number(row.get("ci_low")), finite_number(row.get("ci_high"))
        if low is not None and high is not None and low > high:
            return None, "invalid_interval"
    return {
        "id": str(item.get("id") or index + 1), "table": table, "x": x, "y": y,
        "selectors": selectors, "filter": fixed,
        "row_count": len(rows), "numeric_row_count": len(numeric),
        "table_sha256": digest(path),
    }, None


def validate_point(base: Path, point: dict) -> bool:
    binding = point.get("binding")
    if point.get("status") != "ready" or not binding or not point.get("module"):
        return False
    path = base / "tables" / binding.get("table", "")
    if not path.is_file():
        return False
    columns, rows = csv_rows(path)
    selectors = binding.get("selectors", [])
    required = [*binding.get("filter", {}), *selectors, *[key for key in [binding.get("category"), binding.get("focus")] if key]]
    if any(key not in columns for key in required):
        return False
    rows = [row for row in rows if all(row.get(key, "") in allowed for key, allowed in binding.get("filter", {}).items())]
    if not rows or any(not (base / "tables" / file).is_file() for file in binding.get("companions", [])):
        return False
    groups: dict[tuple, list[dict]] = {}
    for row in rows:
        groups.setdefault(tuple(row.get(key, "") for key in selectors), []).append(row)
    focus = binding.get("focus")
    return all(not focus or any(finite_number(row.get(focus)) is not None for row in group) for group in groups.values())


def audit_module(city: str, module: dict, product_root: Path, policy: dict, tree: dict) -> dict:
    base = product_root / city
    path = base / "articles" / f"{module['module_id']}.json"
    result: dict[str, Any] = {
        "kind": "excluded", "visible": False, "reason_codes": [], "verified_series": [],
        "interactive_point_ids": [], "supplement_point_ids": [], "excluded_point_ids": [], "source_hashes": {},
    }
    reasons = result["reason_codes"]
    if not path.is_file():
        reasons.append("missing_article")
        return result
    try:
        article = json.loads(path.read_text(encoding="utf-8"))
    except (ValueError, OSError):
        reasons.append("unreadable_article")
        return result
    dependencies = policy.get("source_dependencies", {}).get(city, [])
    result["source_hashes"] = source_hashes(city, article, product_root, tree, dependencies)
    if article.get("status") == "NOT_SUPPORTED":
        reasons.append("not_supported_by_current_data")
        return result
    if not article.get("abstract") or not article.get("conclusion") or not article.get("sections"):
        reasons.append("missing_research_results")
    sources_path = base / "sources.json"
    sources = json.loads(sources_path.read_text(encoding="utf-8")) if sources_path.is_file() else []
    source_ids = {source.get("source_id") for source in sources if source.get("title")}
    if any(source not in source_ids for source in article.get("source_ids", [])):
        reasons.append("unregistered_source")
    if not article.get("source_ids") and not dependencies:
        reasons.append("missing_sources")
    if any(not (product_root / dependency / "sources.json").is_file() for dependency in dependencies):
        reasons.append("missing_source_dependency")
    for folder in ["tables", "figures"]:
        if any(Path(item["file"]).name != item["file"] or not (base / folder / item["file"]).is_file() for item in article.get(folder, [])):
            reasons.append(f"missing_{folder}")
    hashes = result["source_hashes"]
    approved = policy.get("reviewed", {}).get(f"{city}/{module['module_id']}")
    if not approved or approved != fingerprint(hashes):
        reasons.append("unreviewed_revision")
    if reasons:
        return result
    for index, series in enumerate((article.get("explorer") or {}).get("series", [])):
        verified, error = validate_series(base, series, index, city)
        if verified:
            result["verified_series"].append(verified)
        elif error:
            reasons.append(error)
    topic = curated_topic(tree, module["module_id"]) if city == "shenyang" else None
    if topic:
        for index, explorer in enumerate(topic.get("explorers", [])):
            verified, error = validate_series(base, {**explorer, "x": explorer["category"], "y": explorer["focus"]}, index, city)
            if verified:
                result["verified_series"].append(verified)
            elif error:
                reasons.append(error)
        for point in topic.get("points", []):
            if validate_point(base, point):
                result["interactive_point_ids"].append(point["id"])
            elif point["id"] in policy.get("supplement_points", []) and point.get("citations"):
                result["supplement_point_ids"].append(point["id"])
            else:
                result["excluded_point_ids"].append(point["id"])
    interactive = bool(result["verified_series"] or result["interactive_point_ids"])
    if reasons:
        # Broken bindings are not silently advertised as a full interactive module.
        return result
    result["kind"] = "interactive" if interactive else "supplement"
    result["visible"] = True
    reasons.append("verified_published_data" if interactive else "verified_complete_article")
    return result


def attach_presentation(catalog: dict, product_root: Path, policy: dict, tree: dict) -> dict:
    # This is a derived catalog, never the article payload.
    if policy.get("version") != PRESENTATION_VERSION:
        raise ValueError("Research presentation policy version is unsupported")
    catalog = json.loads(json.dumps(catalog))
    catalog["presentation_version"] = PRESENTATION_VERSION
    for city in catalog["cities"]:
        for module in city["modules"]:
            module["presentation"] = audit_module(city["city"], module, product_root, policy, tree)
        visible = [module for module in city["modules"] if module["presentation"]["visible"]]
        interactive = [module for module in visible if module["presentation"]["kind"] == "interactive"]
        default = policy.get("defaults", {}).get(city["city"], {})
        chosen = next((module for module in interactive if module["module_id"] == default.get("module_id")), None)
        chosen = chosen or next(iter(interactive or visible), None)
        selection = default.get("selection_id") if chosen and chosen["module_id"] == default.get("module_id") else None
        if selection and "." in selection and selection not in chosen["presentation"]["interactive_point_ids"]:
            selection = None
        if chosen and not selection and chosen["presentation"]["interactive_point_ids"] and not chosen["presentation"]["verified_series"]:
            selection = chosen["presentation"]["interactive_point_ids"][0]
        city["presentation"] = {
            "default_module_id": chosen["module_id"] if chosen else None,
            "default_selection_id": selection or (canonical_id(chosen["module_id"]) if chosen else None),
            "visible_count": len(visible), "interactive_count": len(interactive), "supplement_count": len(visible) - len(interactive),
        }
    return catalog


def load_policy() -> dict:
    return json.loads(POLICY_PATH.read_text(encoding="utf-8"))


def load_tree() -> dict:
    return json.loads(TREE_PATH.read_text(encoding="utf-8"))
