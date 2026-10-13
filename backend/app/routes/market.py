from typing import Optional

from fastapi import APIRouter, Query

from ..services import market_service, market_display_service

router = APIRouter(tags=["observations"])


@router.get("/api/market/observations", summary="本城同市场同价格口径的正式历史观测")
def observations(city: str = Query(...), crop: Optional[str] = Query(None)):
    return market_service.observations(city, crop)


@router.get("/api/market/display", summary="完整行情展示视图（不用于研究或模型输入）")
def display(region: Optional[str] = Query(None), product: Optional[str] = Query(None),
            price_level: Optional[str] = Query(None)):
    return market_display_service.display(region, product, price_level)
