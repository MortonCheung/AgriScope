# -*- coding: utf-8 -*-
"""market_feed 命令行入口。

用法：
  python -m pipelines.daily.market_feed run [--regions shenyang,liaoning] [--date 2026-10-13] [--no-publish]
  python -m pipelines.daily.market_feed backfill --start 2026-10-01 --end 2026-10-13 [--regions ...]
  python -m pipelines.daily.market_feed status
  python -m pipelines.daily.market_feed publish        # 仅用已有库重发快照
"""
from __future__ import annotations

import argparse
import json
import sys
from datetime import date, timedelta

from . import aggregate as AGG
from . import config as C, publish as P
from .clock import parse_date, today
from .runner import run
from .store import Store


def _parse_date(text: str | None) -> date | None:
    if not text:
        return None
    d = parse_date(text)
    if d is None:
        raise SystemExit(f"非法日期：{text}（应为 YYYY-MM-DD）")
    return d


def _regions(text: str | None) -> list[str] | None:
    if not text:
        return None
    out = [r.strip() for r in text.split(",") if r.strip()]
    bad = [r for r in out if r not in C.REGIONS]
    if bad:
        raise SystemExit(f"未知区域：{bad}（可选：{', '.join(C.REGION_ORDER)}）")
    return out


def _progress(*args):
    print("  ·", " ".join(str(a) for a in args), file=sys.stderr)


def cmd_run(args) -> int:
    summary = run(regions=_regions(args.regions), target_date=_parse_date(args.date),
                  publish_output=not args.no_publish, progress=_progress)
    print(json.dumps({"overallStatus": summary["overallStatus"],
                      "published": summary["published"],
                      "regions": [{k: r[k] for k in ("region_id", "status", "note")}
                                  for r in summary["regions"]]},
                     ensure_ascii=False, indent=1))
    return 0 if summary["overallStatus"] != C.ST_FAILED else 1


def cmd_backfill(args) -> int:
    start, end = _parse_date(args.start), _parse_date(args.end) or today()
    if start is None:
        raise SystemExit("backfill 需要 --start")
    d, n = start, 0
    while d <= end:
        run(regions=_regions(args.regions), target_date=d, publish_output=False,
            progress=lambda *a: None)
        n += 1
        d += timedelta(days=1)
    # 全部补采后统一发布
    run(regions=_regions(args.regions), target_date=end, publish_output=True,
        progress=_progress)
    print(f"补采完成：{n} 天（{start} ~ {end}）")
    return 0


def cmd_status(_args) -> int:
    idx = C.SNAPSHOT_DIR / "index.json"
    if not idx.exists():
        print("尚无快照（先运行 run）")
        return 0
    data = json.loads(idx.read_text(encoding="utf-8"))
    print(f"快照生成时间：{data['generatedAt']}  区域数：{data['regionCount']}")
    for r in data["regions"]:
        print(f"  {r['regionName']:<6} {r['status']:<22} 最新 {str(r['latestObservationDate']):<10} "
              f"{r['freshness']:<8} 序列 {r['seriesCount']} 记录 {r['recordCount']}"
              + (f"  ⚠ {r['note']}" if r.get("note") else ""))
    return 0


def cmd_publish(_args) -> int:
    C.ensure_dirs()
    store = Store()
    try:
        snaps = [P.build_region_snapshot(store, rid, status=C.ST_SUCCESS)
                 for rid in C.REGION_ORDER]
        out = P.publish(snaps, P.build_index(snaps))
    finally:
        store.close()
    print(f"已重发快照：{out['index']}")
    return 0


def _aggregate(out_dir=None) -> dict:
    C.ensure_dirs()
    store = Store()
    try:
        return AGG.aggregate(store, out_dir)
    finally:
        store.close()


def cmd_aggregate(args) -> int:
    out = _aggregate(args.out_dir)
    print(json.dumps(out, ensure_ascii=False, indent=1))
    return 0


def cmd_daily(args) -> int:
    """生产入口：采集七区域 → 发布区域快照 → 生成每日汇总报表。"""
    summary = run(regions=_regions(args.regions), target_date=_parse_date(args.date),
                  publish_output=True, progress=_progress)
    agg = _aggregate(args.out_dir)
    print(json.dumps({"overallStatus": summary["overallStatus"],
                      "report": agg,
                      "regions": [{k: r[k] for k in ("region_id", "status")}
                                  for r in summary["regions"]]},
                     ensure_ascii=False, indent=1))
    return 0 if summary["overallStatus"] != C.ST_FAILED else 1


def main(argv=None) -> int:
    p = argparse.ArgumentParser(prog="market_feed", description="AgriScope 七区域每日价格采集")
    sub = p.add_subparsers(dest="cmd", required=True)

    r = sub.add_parser("run", help="采集（默认七区域，发布快照）")
    r.add_argument("--regions")
    r.add_argument("--date")
    r.add_argument("--no-publish", action="store_true")
    r.set_defaults(func=cmd_run)

    b = sub.add_parser("backfill", help="按日期区间补采")
    b.add_argument("--start", required=True)
    b.add_argument("--end")
    b.add_argument("--regions")
    b.set_defaults(func=cmd_backfill)

    s = sub.add_parser("status", help="查看最新快照索引")
    s.set_defaults(func=cmd_status)

    pb = sub.add_parser("publish", help="仅用已有数据库重发快照")
    pb.set_defaults(func=cmd_publish)

    ag = sub.add_parser("aggregate", help="用已有数据库生成每日汇总报表 JSON")
    ag.add_argument("--out-dir")
    ag.set_defaults(func=cmd_aggregate)

    dy = sub.add_parser("daily", help="生产入口：采集 + 快照 + 汇总报表")
    dy.add_argument("--regions")
    dy.add_argument("--date")
    dy.add_argument("--out-dir")
    dy.set_defaults(func=cmd_daily)

    args = p.parse_args(argv)
    return args.func(args)


if __name__ == "__main__":
    raise SystemExit(main())
