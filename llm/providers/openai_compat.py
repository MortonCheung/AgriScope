# -*- coding: utf-8 -*-
"""Phase 10：OpenAI-compatible provider（stdlib HTTP，不引入 openai SDK 强依赖）。

secret 只从环境变量读取（`.env` 由 `.gitignore` 忽略，只提交 `.env.example`）：
  AGRISCOPE_LLM_API_KEY / AGRISCOPE_LLM_BASE_URL / AGRISCOPE_LLM_MODEL
无 key 时 `is_available() == False`，上层自动降级为 stub/统计 fallback（不阻塞）。
"""
from __future__ import annotations

import json
import os
import urllib.error
import urllib.request
from typing import Any, Dict, Optional

from .base import LLMProvider, LLMUnavailable


class OpenAICompatProvider(LLMProvider):
    name = "openai_compatible"
    is_real_llm = True
    seed_supported = True

    def __init__(self, api_key: Optional[str] = None, base_url: Optional[str] = None,
                 model: Optional[str] = None, timeout: int = 60):
        self.api_key = api_key or os.environ.get("AGRISCOPE_LLM_API_KEY") \
            or os.environ.get("OPENAI_API_KEY")
        self.base_url = (base_url or os.environ.get("AGRISCOPE_LLM_BASE_URL")
                         or "https://api.openai.com/v1").rstrip("/")
        self.model = model or os.environ.get("AGRISCOPE_LLM_MODEL") or "gpt-4o-mini"
        self.timeout = timeout

    def is_available(self) -> bool:
        return bool(self.api_key)

    def complete_json(self, *, task: str, system: str, user: str,
                      schema_name: str, context: Optional[Dict[str, Any]] = None,
                      temperature: float = 0.0, seed: Optional[int] = None) -> Dict[str, Any]:
        if not self.is_available():
            raise LLMUnavailable("no_api_key")
        payload: Dict[str, Any] = {
            "model": self.model,
            "temperature": temperature,
            "response_format": {"type": "json_object"},
            "messages": [{"role": "system", "content": system},
                         {"role": "user", "content": user}],
        }
        if seed is not None and self.seed_supported:
            payload["seed"] = seed
        req = urllib.request.Request(
            f"{self.base_url}/chat/completions",
            data=json.dumps(payload).encode("utf-8"),
            headers={"Content-Type": "application/json",
                     "Authorization": f"Bearer {self.api_key}"},
            method="POST")
        try:
            with urllib.request.urlopen(req, timeout=self.timeout) as resp:  # noqa: S310
                body = json.loads(resp.read().decode("utf-8"))
        except urllib.error.HTTPError as e:                                  # noqa: PERF203
            raise LLMUnavailable(f"http_{e.code}") from e
        except Exception as e:                                               # noqa: BLE001
            raise LLMUnavailable(f"transport_error:{type(e).__name__}") from e
        try:
            content = body["choices"][0]["message"]["content"]
            return json.loads(content)
        except Exception as e:                                               # noqa: BLE001
            raise LLMUnavailable("unparsable_response") from e


__all__ = ["OpenAICompatProvider"]