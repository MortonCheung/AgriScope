import os
import sys
import tempfile
from pathlib import Path

# 让 `import pipelines.daily.market_feed` 可用（以仓库根为 sys.path 起点）
ROOT = Path(__file__).resolve().parents[4]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

# 测试期间把运行目录指向临时目录，绝不写源码树
os.environ.setdefault("AGRISCOPE_MARKET_FEED_HOME",
                      tempfile.mkdtemp(prefix="mf-test-home-"))
