# -*- coding: utf-8 -*-
"""研究中心只读路由：`/api/research/*`。

对应产品信息架构的三个一级空间中的「研究中心」：只提供**只读取数**，
列出城市、城市清单、模块索引、article.json、来源、同步报告、表格与图片。
不做任何研究计算、不做结论改写；路径白名单见 `services/research_service.py`。
"""
from __future__ import annotations

from typing import Any, Dict, List

from fastapi import APIRouter
from fastapi.responses import FileResponse, PlainTextResponse

from ..services import research_service as R

router = APIRouter(tags=["research"])


@router.get("/api/research/catalog", summary="研究总索引（轻量，不含正文）")
def catalog() -> Dict[str, Any]:
    return R.catalog()


@router.get("/api/research/cities", summary="已发布研究城市与模块概况")
def cities() -> Dict[str, Any]:
    return R.cities()


@router.get("/api/research/llm-evaluation", summary="LLM 回溯评估证据（真实产物派生，只读）")
def llm_evaluation() -> Dict[str, Any]:
    return R.llm_evaluation()


@router.get("/api/research/{city}/manifest.json", summary="城市研究清单")
def manifest(city: str) -> Dict[str, Any]:
    return R.manifest(city)


@router.get("/api/research/{city}/sources.json", summary="城市数据来源清单")
def sources(city: str) -> List[Dict[str, Any]]:
    return R.sources(city)


@router.get("/api/research/{city}/sync-report.json", summary="城市研究同步报告")
def sync_report(city: str) -> Dict[str, Any]:
    return R.sync_report(city)


@router.get("/api/research/{city}/articles/{article_id}.json", summary="研究模块正文")
def article(city: str, article_id: str) -> Dict[str, Any]:
    return R.article(city, article_id)


@router.get("/api/research/{city}/references.md", response_class=PlainTextResponse,
            summary="来源与参考文献清单（纯文本）")
def references(city: str) -> str:
    return R.references(city)


@router.get("/api/research/{city}/tables/{file}", summary="研究数据表（CSV，按需加载）")
def table(city: str, file: str) -> FileResponse:
    path, media = R.table(city, file)
    return FileResponse(path, media_type=media)


@router.get("/api/research/{city}/figures/{file}", summary="研究插图（按需加载）")
def figure(city: str, file: str) -> FileResponse:
    path, media = R.figure(city, file)
    return FileResponse(path, media_type=media)