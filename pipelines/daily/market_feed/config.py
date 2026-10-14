# -*- coding: utf-8 -*-
"""AgriScope 七区域每日农产品价格采集 · 配置与契约常量。

设计原则
--------
- **仅标准库**：不依赖 pandas / numpy / 模型资产；可在 2GiB 低配 ECS 长期运行。
- **源码与运行目录分离**：输出目录由 ``AGRISCOPE_MARKET_FEED_HOME`` 决定，
  默认落在本包内的 ``.data/``（已 gitignore），绝不在源码树内散落生成物。
- **口径不可混淆**：价格层级、单位换算、作物映射集中在本文件，禁止在适配器里另造。
- 时间统一 ``Asia/Shanghai``；``observation_date``（官方监测日）与
  ``collected_at``（本系统抓取时刻）严格区分。
"""
from __future__ import annotations

import os
import sys
from pathlib import Path

# ---------------------------------------------------------------- 路径
PKG_DIR = Path(__file__).resolve().parent
REPO_ROOT = PKG_DIR.parents[2]  # .../AgriScope  (worktree 根 = 只读产品)

# 运行目录必须落在独立 worker，绝不写进只读产品源码/历史 raw。
# 复用共享路径合同 agriscope_paths（PROJECT_ROOT / AGRISCOPE_WORKER_ROOT）。
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))
try:
    from agriscope_paths import paths as _paths
    WORKER_ROOT = _paths().worker
except Exception:  # noqa: BLE001 - 无合同模块时退化为产品同级 agriscope-worker
    WORKER_ROOT = (REPO_ROOT.parent / "agriscope-worker").resolve()

HOME = Path(os.environ.get("AGRISCOPE_MARKET_FEED_HOME") or (WORKER_ROOT / "market_feed")).resolve()
RAW_DIR = HOME / "raw"            # 原始证据（原始响应原样落盘）
DB_PATH = HOME / "market_feed.sqlite"
SNAPSHOT_DIR = HOME / "snapshots"  # 供前端读取的版本化 JSON（每区域）
LOG_DIR = HOME / "logs"
LOCK_PATH = HOME / ".run.lock"

# 每日汇总产物目录（同城+同品种+同日 算术平均的报表 JSON）——同样落在 worker。
REPORT_DIR = Path(
    os.environ.get("AGRISCOPE_MARKET_FEED_REPORT_DIR")
    or str(WORKER_ROOT / "market_feed" / "reports")
).resolve()

# 产品 runtime 的 V3 行情发布目录（只读产品的 runtime 由发布器原子写入）。
PRODUCT_ROOT = REPO_ROOT
RUNTIME_DIR = PRODUCT_ROOT / "runtime"

# ---------------------------------------------------------------- 版本
SCHEMA_VERSION = "1.0.0"          # 快照 JSON 契约版本
FRAMEWORK_VERSION = "market-feed-1.0.0"

TZ_NAME = "Asia/Shanghai"

# ---------------------------------------------------------------- 网络礼貌
HTTP_TIMEOUT = int(os.environ.get("AGRISCOPE_HTTP_TIMEOUT", "30"))
HTTP_RETRIES = int(os.environ.get("AGRISCOPE_HTTP_RETRIES", "3"))
HTTP_SLEEP = float(os.environ.get("AGRISCOPE_HTTP_SLEEP", "1.0"))
# 自定义 CA（可选）；为空时使用系统信任库 + certifi，绝不关闭校验。
SOURCE_CA_FILE = os.environ.get("AGRISCOPE_SOURCE_CA_FILE") or None
USER_AGENT = (
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
)

# ---------------------------------------------------------------- 区域
# 七个必须覆盖的区域。liaoning 为「辽宁省全省」，使用真实省级监测来源，
# 绝不等于六市算术平均。
REGIONS: dict[str, dict] = {
    "shenyang": {"name": "沈阳市", "kind": "city", "admin_code": "210100000000", "display": "沈阳"},
    "tieling": {"name": "铁岭市", "kind": "city", "admin_code": "211200000000", "display": "铁岭"},
    "chaoyang": {"name": "朝阳市", "kind": "city", "admin_code": "211300000000", "display": "朝阳"},
    "jinzhou": {"name": "锦州市", "kind": "city", "admin_code": "210700000000", "display": "锦州"},
    "dandong": {"name": "丹东市", "kind": "city", "admin_code": "210600000000", "display": "丹东"},
    "dalian": {"name": "大连市", "kind": "city", "admin_code": "210200000000", "display": "大连"},
    "liaoning": {"name": "辽宁省", "kind": "province", "admin_code": None, "display": "全省"},
}
REGION_ORDER = ["liaoning", "shenyang", "chaoyang", "jinzhou", "dalian", "dandong", "tieling"]

# ---------------------------------------------------------------- 价格口径
# 与项目既有治理口径一致（pipelines/daily/config.py）。严禁把不同口径混入同一序列。
PRICE_LEVELS = [
    "wholesale",       # 批发价
    "market_average",  # 监测点/全市平均价
    "retail",          # 零售价（泛）
    "retail_market",   # 集市零售价
    "supermarket",     # 超市零售价
    "farm_gate",       # 产地/收购价
    "purchase",        # 采购价
    "other",
]
PRICE_LEVEL_CN = {
    "wholesale": "批发价",
    "market_average": "监测均价",
    "retail": "零售价",
    "retail_market": "集市零售价",
    "supermarket": "超市零售价",
    "farm_gate": "产地价",
    "purchase": "采购价",
    "other": "其他",
}

# 前端按钮展示顺序（批发/超市/集市优先）
PRICE_LEVEL_ORDER = ["wholesale", "supermarket", "retail_market",
                     "market_average", "retail", "farm_gate", "purchase", "other"]

# 各区域**声明支持**的价格口径（用于嵌套视图补 `price=null`，缺失不填 0）。
# 依据各来源的真实口径：沈阳菜篮子含 批发/超市/集市 三档；锦州周报为零售均价；
# 其余城市与省级为监测（均价）。仅声明实际存在来源的口径，不臆造。
REGION_PRICE_LEVELS: dict[str, list[str]] = {
    "shenyang": ["wholesale", "supermarket", "retail_market"],
    "jinzhou": ["retail"],
    "liaoning": ["market_average"],
    "chaoyang": ["market_average"],
    "dalian": ["market_average"],
    "dandong": ["market_average"],
    "tieling": ["market_average"],
}

# ---------------------------------------------------------------- 单位换算
# 仅做数学可验证的质量换算（元/公斤）。体积/未知单位一律不换算（price_per_kg=None）。
UNIT_TO_KG = {
    "元/500克": 2.0, "元/500g": 2.0, "元/斤": 2.0, "元/500G": 2.0,
    "元/250g": 4.0, "元/250克": 4.0,
    "元/公斤": 1.0, "元/千克": 1.0, "元/kg": 1.0, "元/KG": 1.0, "元/公斤(kg)": 1.0,
}
# 明确不可换算（体积等）——出现即 price_per_kg=None，不得猜测。
NON_MASS_UNITS = {"元/5升", "元/升", "元/L", "元/l", "元/ml", "元/mL", "元/毫升",
                  "元/500ml", "元/500mL", "元/袋", "元/吨", "元/瓶", "元/盒"}
# 任一包含以下标记的单位一律不换算（体积/计数，非质量）
NON_MASS_MARKERS = ("升", "ml", "mL", "毫升", "袋", "瓶", "盒", "吨", "个", "把")

# ---------------------------------------------------------------- 作物标准化
# 原始名 -> 正式展示名。土豆 为正式展示名（马铃薯 归入 土豆），保持可追溯。
CROP_ALIASES = {
    "马铃薯": "土豆", "洋芋": "土豆", "土豆": "土豆",
    "番茄": "西红柿", "西红柿": "西红柿", "圣女果": "西红柿",
    "青椒": "青椒", "柿子椒": "青椒", "尖椒": "尖椒", "辣椒": "尖椒",
    "甘蓝": "甘蓝", "卷心菜": "甘蓝", "圆白菜": "甘蓝", "大头菜": "甘蓝",
    "芸豆": "芸豆", "豆角": "芸豆", "四季豆": "芸豆",
    "大白菜": "大白菜", "白菜": "大白菜",
    "芹菜": "芹菜", "水芹": "芹菜",
    "蒜薹": "蒜薹", "蒜苔": "蒜薹",
    "圆葱": "圆葱", "葱头": "圆葱", "洋葱": "圆葱",
    "胡萝卜": "胡萝卜", "萝卜": "萝卜", "青萝卜": "青萝卜",
    "大葱": "大葱", "生姜": "生姜", "大蒜": "大蒜",
    "西葫芦": "西葫芦", "茭瓜": "西葫芦",
    "生菜": "生菜", "油菜": "油菜", "菠菜": "菠菜", "菜花": "菜花",
    "豆芽": "豆芽", "豇豆": "豇豆", "冬瓜": "冬瓜", "南瓜": "南瓜",
    "玉米": "玉米", "水稻": "水稻", "大豆": "大豆", "大米": "大米",
    "面粉": "面粉", "猪肉": "猪肉", "鲜猪肉": "猪肉", "猪精瘦肉": "猪肉",
    "牛肉": "牛肉", "羊肉": "羊肉", "鸡肉": "鸡肉", "白条鸡": "鸡肉",
    "鸡蛋": "鸡蛋", "鲜奶": "鲜奶", "牛奶": "鲜奶",
    "豆油": "豆油", "大豆油": "豆油", "花生油": "花生油", "桶装花生油": "花生油",
    "仔猪": "仔猪", "生猪": "生猪",
}
# 注意：仔猪 与 生猪 是不同商品，绝不因名称相近而合并。

# ---------------------------------------------------------------- 采集状态
ST_SUCCESS = "SUCCESS"
ST_PARTIAL = "PARTIAL"
ST_NO_NEW_PUBLICATION = "NO_NEW_PUBLICATION"
ST_FAILED = "FAILED"
ST_SOURCE_SCHEMA_CHANGED = "SOURCE_SCHEMA_CHANGED"
ST_SKIPPED = "SKIPPED"

# 数据质量状态
QC_OK = "OK"
QC_SUSPECT = "SUSPECT"
QC_REJECTED = "REJECTED"
QC_DUPLICATE = "DUPLICATE"

# ---------------------------------------------------------------- 新鲜度
FRESH = "FRESH"
DELAYED = "DELAYED"
STALE = "STALE"
MISSING = "MISSING"
FRESH_MAX_AGE = 0
DELAYED_MAX_AGE = 2
STALE_MAX_AGE = 7


def freshness_for_age(age_days: int | None) -> str:
    if age_days is None:
        return MISSING
    if age_days <= FRESH_MAX_AGE:
        return FRESH
    if age_days <= DELAYED_MAX_AGE:
        return DELAYED
    if age_days <= STALE_MAX_AGE:
        return STALE
    return MISSING


def ensure_dirs() -> None:
    for d in (HOME, RAW_DIR, SNAPSHOT_DIR, LOG_DIR):
        d.mkdir(parents=True, exist_ok=True)
