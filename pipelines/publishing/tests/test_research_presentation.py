import copy
import json
from pathlib import Path
import pytest

from pipelines.publishing.research_presentation import (
    attach_presentation, load_policy, load_tree, validate_series,
)

ROOT = Path(__file__).resolve().parents[3]
PRODUCT = ROOT / "runtime/research/product"
CATALOG = ROOT / "runtime/research/research_catalog.json"


def test_real_audit_is_deterministic_and_preserves_original_status_and_assets():
    catalog = json.loads(CATALOG.read_text())
    original = copy.deepcopy(catalog)
    first = attach_presentation(catalog, PRODUCT, load_policy(), load_tree())
    second = attach_presentation(first, PRODUCT, load_policy(), load_tree())
    assert catalog == original
    assert first == second == catalog
    cities = {city["city"]: city for city in first["cities"]}
    assert sum(city["presentation"]["visible_count"] for city in first["cities"]) == 42
    assert sum(city["presentation"]["interactive_count"] for city in first["cities"] if city["city"] != "cross_city") == 39
    assert cities["shenyang"]["presentation"]["default_selection_id"] == "A1.3"
    for city in ["tieling", "dandong"]:
        visible = [module["module_id"] for module in cities[city]["modules"] if module["presentation"]["visible"]]
        assert visible == ["A07", "A09"]
        assert cities[city]["presentation"]["default_module_id"] == "A07"
        assert len(cities[city]["modules"]) == 9
    for city in first["cities"]:
        for module in city["modules"]:
            raw = json.loads((PRODUCT / city["city"] / "articles" / f"{module['module_id']}.json").read_text())
            assert module["status"] == raw["status"]
            assert module["presentation"]["source_hashes"]


def test_draft_needs_pinned_review_and_scientific_negative_is_not_excluded_by_words():
    catalog = json.loads(CATALOG.read_text())
    policy = load_policy()
    policy["reviewed"].pop("chaoyang/A06")
    output = attach_presentation(catalog, PRODUCT, policy, load_tree())
    city = next(city for city in output["cities"] if city["city"] == "chaoyang")
    a06 = next(module for module in city["modules"] if module["module_id"] == "A06")
    assert a06["presentation"]["kind"] == "excluded"
    assert "unreviewed_revision" in a06["presentation"]["reason_codes"]
    original = next(city for city in catalog["cities"] if city["city"] == "chaoyang")
    assert next(module for module in original["modules"] if module["module_id"] == "A06")["presentation"]["kind"] == "interactive"


def test_curated_bindings_and_quotes_cannot_bypass_review_by_only_changing_the_tree():
    tree = load_tree()
    tree["topics"][0]["points"][0]["title"] = "unreviewed replacement"
    output = attach_presentation(json.loads(CATALOG.read_text()), PRODUCT, load_policy(), tree)
    shenyang = next(city for city in output["cities"] if city["city"] == "shenyang")
    a01 = next(module for module in shenyang["modules"] if module["module_id"] == "A01")
    assert a01["presentation"]["visible"] is False
    assert "unreviewed_revision" in a01["presentation"]["reason_codes"]


def test_unknown_policy_version_fails_explicitly():
    policy = {**load_policy(), "version": "unrecognized"}
    with pytest.raises(ValueError, match="policy version"):
        attach_presentation(json.loads(CATALOG.read_text()), PRODUCT, policy, load_tree())


def test_real_point_classifications_keep_negative_evidence_without_unsupported_placeholders():
    catalog = json.loads(CATALOG.read_text())
    shenyang = next(city for city in catalog["cities"] if city["city"] == "shenyang")
    points = [point for module in shenyang["modules"] for point in module["presentation"]["interactive_point_ids"]]
    assert len(points) == 54
    assert "A3.10" in shenyang["modules"][2]["presentation"]["supplement_point_ids"]
    assert "A6.6" in shenyang["modules"][5]["presentation"]["supplement_point_ids"]
    assert "A4.4" in shenyang["modules"][3]["presentation"]["excluded_point_ids"]


def test_invalid_default_point_chooses_a_real_data_point_instead_of_a_static_direction():
    policy = load_policy()
    policy["defaults"]["shenyang"]["selection_id"] = "A1.999"
    output = attach_presentation(json.loads(CATALOG.read_text()), PRODUCT, policy, load_tree())
    shenyang = next(city for city in output["cities"] if city["city"] == "shenyang")
    assert shenyang["presentation"]["default_selection_id"] == "A1.1"


def test_series_requires_actual_columns_and_finite_results_not_an_explorer_flag(tmp_path):
    folder = tmp_path / "tables"
    folder.mkdir()
    table = folder / "sample.csv"
    table.write_text("crop,value,city\npotato,,A\ncabbage,NaN,A\n")
    config = {"table": "sample.csv", "x": "crop", "y": "value", "group": "city"}
    assert validate_series(tmp_path, config, 0, "test")[1] == "empty_numeric_series"
    table.write_text("crop,value,city\npotato,0,A\ncabbage,-1.5,A\n")
    verified, error = validate_series(tmp_path, config, 0, "test")
    assert error is None
    assert verified["numeric_row_count"] == 2
    assert validate_series(tmp_path, {**config, "y": "missing"}, 0, "test")[1] == "missing_series_column"
    table.write_text("crop,value,city\npotato,0,A\ncabbage,,B\n")
    assert validate_series(tmp_path, config, 0, "test")[1] == "empty_selector_group"


def test_cross_city_pairs_are_selected_by_real_city_a_without_dropping_rows():
    output = attach_presentation(json.loads(CATALOG.read_text()), PRODUCT, load_policy(), load_tree())
    cross = next(city for city in output["cities"] if city["city"] == "cross_city")
    sync = cross["modules"][0]["presentation"]["verified_series"][0]
    assert sync["selectors"] == ["crop", "city_a"]
    assert sync["row_count"] == sync["numeric_row_count"] == 29
