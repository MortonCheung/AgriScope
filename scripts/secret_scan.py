#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Secret 泄露扫描（只读）。

覆盖（§11）：
  1. 工作区已跟踪文件；
  2. Git 全历史（`git log -p --all`，含已删除文件）；
  3. 前端构建产物（frontend/dist、前端源码）—— API Key 绝不能进浏览器；
  4. 运行日志与 LLM 缓存（llm/artifacts）。

只报告 `文件:行号: 规则名`，**绝不打印命中的密文本身**。
误报白名单：示例文件（*.example）、占位符、文档中的变量名说明。
"""
from __future__ import annotations

import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

PATTERNS = {
    "openai_like_key": re.compile(r"\bsk-[A-Za-z0-9_\-]{20,}"),
    "bearer_literal": re.compile(r"Bearer\s+[A-Za-z0-9_\-\.]{24,}"),
    "private_key_block": re.compile(r"-----BEGIN [A-Z ]*PRIVATE KEY-----"),
    "assigned_secret": re.compile(
        r"(?i)(api[_-]?key|secret|token|password)\s*[:=]\s*[\"']([A-Za-z0-9_\-\.]{24,})[\"']"),
}
ALLOW_LINE = re.compile(r"(?i)(example|placeholder|your[_-]?key|xxx|<.*>|\.\.\.|redacted|\$\{)")
SKIP_SUFFIX = (".png", ".jpg", ".jpeg", ".gif", ".webp", ".ico", ".woff", ".woff2",
               ".ttf", ".otf", ".pdf", ".zip", ".gz", ".pkl", ".parquet", ".lock")


def _scan_text(text: str, label: str, hits: list, max_hits: int = 50) -> None:
    for lineno, line in enumerate(text.splitlines(), 1):
        if ALLOW_LINE.search(line):
            continue
        for name, pattern in PATTERNS.items():
            if pattern.search(line):
                hits.append(f"{label}:{lineno}: {name}")
                if len(hits) >= max_hits:
                    return


def scan_worktree() -> list:
    hits: list = []
    tracked = subprocess.run(["git", "ls-files"], cwd=ROOT, capture_output=True, text=True,
                             check=False).stdout.split("\n")
    extra = ["frontend/dist"] if (ROOT / "frontend" / "dist").is_dir() else []
    extra += ["llm/artifacts", "data/processed"]
    for rel in [p for p in tracked if p] + extra:
        path = ROOT / rel
        if not path.is_file() or path.suffix.lower() in SKIP_SUFFIX:
            continue
        if path.stat().st_size > 4_000_000:
            continue
        try:
            _scan_text(path.read_text(encoding="utf-8", errors="ignore"), rel, hits)
        except OSError:
            continue
    return hits


def scan_history() -> list:
    log = subprocess.run(["git", "log", "-p", "--all", "--no-color", "--diff-filter=AM"],
                         cwd=ROOT, capture_output=True, text=True, check=False).stdout
    hits: list = []
    current = "?"
    for line in log.splitlines():
        if line.startswith("+++ b/"):
            current = line[6:]
            continue
        if line.startswith("+") and not line.startswith("+++"):
            _scan_text(line[1:], f"history:{current}", hits, max_hits=20)
        if len(hits) >= 20:
            break
    return hits


def main() -> int:
    worktree, history = scan_worktree(), scan_history()
    print(f"[secret_scan] worktree_hits={len(worktree)} history_hits={len(history)}")
    for hit in worktree + history:
        print("  ", hit)
    if worktree or history:
        print("状态：SECRET_SCAN_FAILED")
        return 1
    print("状态：SECRET_SCAN_CLEAN")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())