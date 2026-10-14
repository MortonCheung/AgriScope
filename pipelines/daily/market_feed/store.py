# -*- coding: utf-8 -*-
"""SQLite 历史价格存储：幂等 upsert、官方修订留痕、运行状态记录。

- 同一 record_hash（来源+市场+原始品种+规格+监测日+口径）重复采集 → 不新增行。
- 官方后续修订同日价格（content_hash 变化）→ 旧值进 revisions，不静默覆盖。
- 运行状态按「区域」分别记录，不用单一总状态掩盖某城失败。
"""
from __future__ import annotations

import json
import sqlite3
from pathlib import Path
from typing import Iterable, Optional

from . import config as C
from .clock import now_str
from .records import PriceRecord

_SCHEMA = """
CREATE TABLE IF NOT EXISTS observations (
    record_hash           TEXT PRIMARY KEY,
    region_id             TEXT NOT NULL,
    region_name           TEXT NOT NULL,
    source_id             TEXT NOT NULL,
    source_name           TEXT NOT NULL,
    source_url            TEXT,
    market_id             TEXT NOT NULL,
    product_raw           TEXT NOT NULL,
    product_standard      TEXT NOT NULL,
    product_specification TEXT,
    observation_date      TEXT NOT NULL,
    collected_at          TEXT NOT NULL,
    original_price        REAL NOT NULL,
    original_unit         TEXT,
    price_per_kg          REAL,
    price_level           TEXT NOT NULL,
    quality_status        TEXT NOT NULL,
    raw_evidence_path     TEXT,
    source_parser_version TEXT,
    notes                 TEXT,
    content_hash          TEXT NOT NULL,
    revision              INTEGER NOT NULL DEFAULT 0,
    first_seen_at         TEXT NOT NULL,
    last_seen_at          TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_obs_region_date ON observations(region_id, observation_date);
CREATE INDEX IF NOT EXISTS idx_obs_series ON observations(region_id, product_standard, market_id, price_level, source_id);

CREATE TABLE IF NOT EXISTS revisions (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    record_hash     TEXT NOT NULL,
    observed_at     TEXT NOT NULL,
    previous_price  REAL,
    previous_unit   TEXT,
    previous_content_hash TEXT,
    note            TEXT
);

CREATE TABLE IF NOT EXISTS runs (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    run_id        TEXT NOT NULL,
    started_at    TEXT NOT NULL,
    finished_at   TEXT,
    region_id     TEXT NOT NULL,
    source_id     TEXT,
    target_date   TEXT,
    status        TEXT NOT NULL,
    fetched       INTEGER DEFAULT 0,
    inserted      INTEGER DEFAULT 0,
    updated       INTEGER DEFAULT 0,
    rejected      INTEGER DEFAULT 0,
    latest_date   TEXT,
    detail        TEXT
);
CREATE INDEX IF NOT EXISTS idx_runs_region ON runs(region_id, target_date);
"""


class Store:
    def __init__(self, path: Path | str = C.DB_PATH):
        self.path = Path(path)
        self.path.parent.mkdir(parents=True, exist_ok=True)
        self.conn = sqlite3.connect(str(self.path), timeout=30)
        self.conn.row_factory = sqlite3.Row
        self.conn.execute("PRAGMA journal_mode=WAL")
        self.conn.execute("PRAGMA busy_timeout=30000")
        self.conn.executescript(_SCHEMA)
        self.conn.commit()

    def close(self) -> None:
        self.conn.close()

    # ------------------------------------------------------------- 写入
    def upsert(self, rec: PriceRecord) -> str:
        """返回 'inserted' / 'unchanged' / 'updated'。"""
        rec.finalize()
        cur = self.conn.execute(
            "SELECT content_hash, original_price, original_unit, revision FROM observations "
            "WHERE record_hash=?", (rec.record_hash,))
        row = cur.fetchone()
        c_hash, now = rec.content_hash(), now_str()
        if row is None:
            self.conn.execute(
                """INSERT INTO observations
                (record_hash, region_id, region_name, source_id, source_name, source_url,
                 market_id, product_raw, product_standard, product_specification,
                 observation_date, collected_at, original_price, original_unit, price_per_kg,
                 price_level, quality_status, raw_evidence_path, source_parser_version,
                 notes, content_hash, revision, first_seen_at, last_seen_at)
                VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
                (rec.record_hash, rec.region_id, rec.region_name, rec.source_id, rec.source_name,
                 rec.source_url, rec.market_id, rec.product_raw, rec.product_standard,
                 rec.product_specification, rec.observation_date, rec.collected_at,
                 rec.original_price, rec.original_unit, rec.price_per_kg, rec.price_level,
                 rec.quality_status, rec.raw_evidence_path, rec.source_parser_version,
                 json.dumps(rec.notes, ensure_ascii=False), c_hash, 0, now, now))
            self.conn.commit()
            return "inserted"
        if row["content_hash"] == c_hash:
            self.conn.execute("UPDATE observations SET last_seen_at=? WHERE record_hash=?",
                              (now, rec.record_hash))
            self.conn.commit()
            return "unchanged"
        # 官方修订：留痕旧值
        self.conn.execute(
            "INSERT INTO revisions (record_hash, observed_at, previous_price, previous_unit, "
            "previous_content_hash, note) VALUES (?,?,?,?,?,?)",
            (rec.record_hash, now, row["original_price"], row["original_unit"],
             row["content_hash"], "official_revision"))
        self.conn.execute(
            """UPDATE observations SET original_price=?, original_unit=?, price_per_kg=?,
               collected_at=?, raw_evidence_path=?, content_hash=?, revision=revision+1,
               last_seen_at=? WHERE record_hash=?""",
            (rec.original_price, rec.original_unit, rec.price_per_kg, rec.collected_at,
             rec.raw_evidence_path, c_hash, now, rec.record_hash))
        self.conn.commit()
        return "updated"

    def record_rejected(self, rec: PriceRecord, reason: str) -> None:
        # 拒绝项不入 observations，但保留可追溯（写入 runs.detail 由调用方汇总）
        pass

    def log_run(self, run_id: str, region_id: str, status: str, *, source_id: str = "",
                target_date: str = "", fetched: int = 0, inserted: int = 0, updated: int = 0,
                rejected: int = 0, latest_date: str = "", detail: dict | None = None,
                started_at: str = "") -> None:
        self.conn.execute(
            """INSERT INTO runs (run_id, started_at, finished_at, region_id, source_id,
               target_date, status, fetched, inserted, updated, rejected, latest_date, detail)
               VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)""",
            (run_id, started_at or now_str(), now_str(), region_id, source_id, target_date,
             status, fetched, inserted, updated, rejected, latest_date,
             json.dumps(detail or {}, ensure_ascii=False)))
        self.conn.commit()

    # ------------------------------------------------------------- 读取
    def latest_date(self, region_id: str) -> Optional[str]:
        r = self.conn.execute(
            "SELECT MAX(observation_date) AS d FROM observations "
            "WHERE region_id=? AND price_per_kg IS NOT NULL", (region_id,)).fetchone()
        return r["d"] if r and r["d"] else None

    def series(self, region_id: str, *, product_standard: str | None = None,
               market_id: str | None = None, price_level: str | None = None,
               source_id: str | None = None) -> list[sqlite3.Row]:
        q = ("SELECT * FROM observations WHERE region_id=? AND price_per_kg IS NOT NULL")
        p: list = [region_id]
        for col, val in (("product_standard", product_standard), ("market_id", market_id),
                         ("price_level", price_level), ("source_id", source_id)):
            if val is not None:
                q += f" AND {col}=?"
                p.append(val)
        q += " ORDER BY observation_date"
        return self.conn.execute(q, p).fetchall()

    def region_rows(self, region_id: str) -> list[sqlite3.Row]:
        return self.conn.execute(
            "SELECT * FROM observations WHERE region_id=? AND price_per_kg IS NOT NULL "
            "ORDER BY observation_date", (region_id,)).fetchall()

    def counts(self, region_id: str) -> dict:
        r = self.conn.execute(
            "SELECT COUNT(*) n, MIN(observation_date) a, MAX(observation_date) b "
            "FROM observations WHERE region_id=?", (region_id,)).fetchone()
        return {"records": r["n"], "first_date": r["a"], "last_date": r["b"]}
