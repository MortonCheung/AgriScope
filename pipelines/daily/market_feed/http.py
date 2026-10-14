# -*- coding: utf-8 -*-
"""标准库 HTTP 客户端：有限重试、超时、退避、Cookie 会话（ASP.NET ViewState 必需）。

不绕过任何验证码/访问控制；仅以合理 User-Agent 与请求间隔做礼貌采集。
"""
from __future__ import annotations

import gzip
import http.cookiejar
import ssl
import time
import urllib.error
import urllib.parse
import urllib.request
from dataclasses import dataclass
from typing import Optional

from . import config as C


@dataclass
class Response:
    status: int
    body: bytes
    url: str
    content_type: str = ""

    def text(self, encodings=("utf-8", "gbk", "gb18030")) -> str:
        for e in encodings:
            try:
                return self.body.decode(e)
            except (UnicodeDecodeError, LookupError):
                continue
        return self.body.decode("utf-8", "ignore")


def _ssl_ctx() -> ssl.SSLContext:
    ctx = ssl.create_default_context()
    ctx.check_hostname = False
    ctx.verify_mode = ssl.CERT_NONE
    return ctx


class Session:
    """保持 Cookie 的会话（ASP.NET 需在同一会话内取 ViewState 再回传）。"""

    def __init__(self, timeout: int = C.HTTP_TIMEOUT, retries: int = C.HTTP_RETRIES,
                 sleep: float = C.HTTP_SLEEP):
        self.timeout = timeout
        self.retries = retries
        self.sleep = sleep
        jar = http.cookiejar.CookieJar()
        self._opener = urllib.request.build_opener(
            urllib.request.HTTPCookieProcessor(jar),
            urllib.request.HTTPSHandler(context=_ssl_ctx()),
            urllib.request.ProxyHandler({}),  # 禁用系统代理，直连 gov.cn
        )
        self._opener.addheaders = [("User-Agent", C.USER_AGENT),
                                   ("Accept-Encoding", "gzip")]

    def _open(self, req: urllib.request.Request) -> Response:
        last: Optional[Exception] = None
        for attempt in range(1, self.retries + 1):
            try:
                with self._opener.open(req, timeout=self.timeout) as r:
                    body = r.read()
                    if r.headers.get("Content-Encoding") == "gzip":
                        body = gzip.decompress(body)
                    return Response(status=r.status, body=body, url=r.geturl(),
                                    content_type=r.headers.get("Content-Type", ""))
            except Exception as exc:  # noqa: BLE001
                last = exc
                if attempt < self.retries:
                    time.sleep(1.5 * attempt)
        raise last  # type: ignore[misc]

    def get(self, url: str, referer: Optional[str] = None,
            extra_headers: Optional[dict] = None) -> Response:
        headers = dict(extra_headers or {})
        if referer:
            headers["Referer"] = referer
        req = urllib.request.Request(url, headers=headers)
        return self._open(req)

    def post_form(self, url: str, data: dict, referer: Optional[str] = None,
                  extra_headers: Optional[dict] = None) -> Response:
        headers = {"Content-Type": "application/x-www-form-urlencoded"}
        headers.update(extra_headers or {})
        if referer:
            headers["Referer"] = referer
        body = urllib.parse.urlencode(data).encode("utf-8")
        req = urllib.request.Request(url, data=body, headers=headers)
        return self._open(req)
