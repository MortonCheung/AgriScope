# -*- coding: utf-8 -*-
"""FastAPI 应用装配：生命周期绑定 + CORS + 统一错误契约 + request_id。

启动流程（lifespan）：
  1. 绑定运行时快照（一次）→ 之后请求级只读，天然并发安全；
  2. 预加载 Final 引擎（模型 startup preload）；
  3. 就绪检查前不对外声明 ready（见 /health/ready）。
"""
from __future__ import annotations

import logging
import sys
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Any, Dict

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware

# 统一 env 加载（系统环境变量优先，backend/.env 兜底）。先把仓库根放进 sys.path，
# 这样无论从哪个 cwd 启动（dev.sh / npm run dev:api / systemd）都能找到唯一 loader。
_REPO_ROOT = Path(__file__).resolve().parents[2]
if str(_REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(_REPO_ROOT))
from agriscope_env import load_env  # noqa: E402

load_env()

from . import config as C
from . import runtime_snapshot as RS
from .dependencies import get_engine, new_request_id
from .errors import ApiError, ErrorCode, error_body
from .responses import SafeJSONResponse
from .routes import capabilities, daily, decision, forecast, health, meta

logging.basicConfig(level=logging.INFO,
                    format="%(asctime)s %(levelname)s %(name)s %(message)s")
log = logging.getLogger("agriscope.api")

# JSON 请求体上限（与桥接实现的 64KB 对齐，避免超大请求拖垮推理进程）
MAX_JSON_BYTES = 64 * 1024

TAGS_METADATA = [
    {"name": "health", "description": "存活 / 就绪探针"},
    {"name": "meta", "description": "版本矩阵"},
    {"name": "capabilities", "description": "城市决策能力"},
    {"name": "decision", "description": "Final Model 推理（评估 / 压力）"},
    {"name": "daily", "description": "Daily 市场脉搏快照"},
    {"name": "forecast", "description": "Long-Horizon 长期预测（情景化，独立于 /api/decision）"},
]


@asynccontextmanager
async def lifespan(app: FastAPI):
    st = RS.bind()
    log.info("runtime snapshot bound: %s [%s]", st.get("snapshot_dir"), st.get("runtime_data_status"))
    if st.get("reason"):
        log.warning("snapshot fallback reason: %s", st.get("reason"))
    try:
        get_engine()
        log.info("Final engine preloaded")
    except Exception:  # noqa: BLE001
        log.exception("Final engine preload failed (推理将在首次请求时重试)")
    yield
    log.info("api shutdown")


app = FastAPI(
    title=C.API_TITLE,
    version=C.API_VERSION,
    description=C.API_DESCRIPTION,
    openapi_tags=TAGS_METADATA,
    lifespan=lifespan,
    default_response_class=SafeJSONResponse,
)


# ---------------------------------------------------------------- request_id + 请求体上限
@app.middleware("http")
async def _request_id_middleware(request: Request, call_next):
    rid = request.headers.get("X-Request-ID") or new_request_id()
    request.state.request_id = rid
    length = request.headers.get("content-length")
    if length is not None and length.isdigit() and int(length) > MAX_JSON_BYTES:
        return SafeJSONResponse(status_code=413, content=error_body(
            ErrorCode.BAD_REQUEST, "请求内容过长。", rid, {"max_bytes": MAX_JSON_BYTES}),
            headers={"X-Request-ID": rid})
    response = await call_next(request)
    response.headers["X-Request-ID"] = rid
    return response


# ---------------------------------------------------------------- CORS
_origins = C.allowed_origins()
if _origins:
    app.add_middleware(
        CORSMiddleware,
        allow_origins=_origins,
        allow_credentials=False,
        allow_methods=["GET", "POST", "OPTIONS"],
        allow_headers=["Content-Type", "X-Request-ID"],
        expose_headers=["X-Request-ID"],
    )


# ---------------------------------------------------------------- 统一错误契约
def _rid(request: Request) -> str:
    return getattr(request.state, "request_id", None) or new_request_id()


@app.exception_handler(ApiError)
async def _api_error_handler(request: Request, exc: ApiError):
    body = error_body(exc.error_code, exc.message, _rid(request), exc.details)
    return SafeJSONResponse(status_code=exc.status_code, content=body)


@app.exception_handler(RequestValidationError)
async def _validation_handler(request: Request, exc: RequestValidationError):
    body = error_body(ErrorCode.VALIDATION_ERROR, "请求体校验失败。", _rid(request),
                      {"errors": _safe_errors(exc.errors())})
    return SafeJSONResponse(status_code=400, content=body)


@app.exception_handler(Exception)
async def _unhandled_handler(request: Request, exc: Exception):
    log.exception("unhandled error")
    body = error_body(ErrorCode.INTERNAL_ERROR, "服务内部错误。", _rid(request),
                      {"type": type(exc).__name__})
    return SafeJSONResponse(status_code=500, content=body)


def _safe_errors(errors: Any) -> Any:
    out = []
    for e in errors or []:
        try:
            out.append({"loc": [str(x) for x in e.get("loc", [])],
                        "msg": str(e.get("msg")), "type": str(e.get("type"))})
        except Exception:  # noqa: BLE001
            out.append({"msg": "unparsable"})
    return out


# ---------------------------------------------------------------- 路由
app.include_router(health.router)
app.include_router(meta.router)
app.include_router(capabilities.router)
app.include_router(decision.router)
app.include_router(daily.router)
app.include_router(forecast.router)


@app.get("/", include_in_schema=False)
def root() -> Dict[str, Any]:
    return {"service": C.API_TITLE, "version": C.API_VERSION, "docs": "/docs"}