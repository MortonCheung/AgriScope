# -*- coding: utf-8 -*-
"""Phase 10：OpenAI-compatible provider（stdlib HTTP，不引入 openai SDK 强依赖）。

secret 只从环境变量读取（`.env` 由 `.gitignore` 忽略，只提交 `.env.example`）：
  AGRISCOPE_LLM_API_KEY / AGRISCOPE_LLM_BASE_URL / AGRISCOPE_LLM_MODEL
无 key 时 `is_available() == False`，RC2 实验报告 Secret 阻塞；不运行 stub 数值实验。
"""
from __future__ import annotations

import json
import os
import urllib.error
import urllib.request
from urllib.parse import urlsplit
from typing import Any, Dict, Optional

from .base import LLMProvider, LLMUnavailable


class OpenAICompatProvider(LLMProvider):
    name = "openai_compatible"
    is_real_llm = True
    seed_supported = True

    def __init__(self, api_key: Optional[str] = None, base_url: Optional[str] = None,
                 model: Optional[str] = None, timeout: int = 60, max_completion_tokens: int = 1200):
        self.api_key = api_key or os.environ.get("AGRISCOPE_LLM_API_KEY") \
            or os.environ.get("OPENAI_API_KEY")
        self.base_url = (base_url or os.environ.get("AGRISCOPE_LLM_BASE_URL")
                         or "https://api.openai.com/v1").rstrip("/")
        self.model = model or os.environ.get("AGRISCOPE_LLM_MODEL") or "gpt-4o-mini"
        self.timeout = timeout
        self.max_completion_tokens = max_completion_tokens
        self._metadata: Dict[str, Any] = {}
        self.seed_supported = os.environ.get("AGRISCOPE_LLM_SEED_SUPPORTED", "false").lower() == "true"
        parsed = urlsplit(self.base_url)
        if parsed.scheme != "https" or parsed.username or parsed.password or parsed.query or parsed.fragment:
            raise ValueError("LLM base URL must be HTTPS without credentials, query or fragment")

    def is_available(self) -> bool:
        return bool(self.api_key)

    def cache_config(self) -> Dict[str, Any]:
        return {**self.describe(), "base_url": self.base_url, "timeout": self.timeout,
                "response_format": "json_object", "max_completion_tokens": self.max_completion_tokens}

    def call_metadata(self) -> Dict[str, Any]:
        return dict(self._metadata)

    def complete_json(self, *, task: str, system: str, user: str,
                      schema_name: str, context: Optional[Dict[str, Any]] = None,
                      temperature: float = 0.0, seed: Optional[int] = None) -> Dict[str, Any]:
        self._metadata = {"token_usage": "unknown", "estimated_cost_usd": "unknown"}
        if not self.is_available():
            raise LLMUnavailable("no_api_key")
        payload: Dict[str, Any] = {
            "model": self.model,
            "temperature": temperature,
            "max_completion_tokens": self.max_completion_tokens,
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
            choice = body["choices"][0]
            usage = body.get("usage")
            self._metadata = {"token_usage": usage if isinstance(usage, dict) else "unknown",
                              "estimated_cost_usd": "unknown",
                              "response_model": body.get("model", "unknown"),
                              "response_id": body.get("id", "unknown"),
                              "system_fingerprint": body.get("system_fingerprint", "unknown")}
            if choice.get("finish_reason") != "stop" or choice["message"].get("refusal"):
                raise LLMUnavailable("incomplete_or_refused_response")
            content = choice["message"]["content"]
            return json.loads(content)
        except LLMUnavailable:
            raise
        except Exception as e:                                               # noqa: BLE001
            raise LLMUnavailable("unparsable_response") from e


__all__ = ["OpenAICompatProvider"]
