from typing import Optional

from fastapi import APIRouter, Query

from ..services import market_service

router = APIRouter(tags=["observations"])


@router.get("/api/market/observations", summary="本城同市场同价格口径的正式历史观测")
def observations(city: str = Query(...), crop: Optional[str] = Query(None)):
    return market_service.observations(city, crop)
