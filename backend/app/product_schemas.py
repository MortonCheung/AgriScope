"""Product planning contract. The frozen Final/long-horizon contracts remain separate."""
from datetime import date
import re
from typing import Any, Dict, List, Literal, Optional

from pydantic import BaseModel, ConfigDict, Field, field_validator


class ProductDecisionRequest(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True, allow_inf_nan=False)
    contract_version: Literal["product-1"]
    city_id: Literal["shenyang", "tieling", "chaoyang", "jinzhou", "dandong", "dalian"]
    crop: str
    area_mu: float = Field(gt=0)
    budget_cny: Optional[float] = Field(default=None, ge=0)
    target: Literal["conservative", "balanced", "aggressive"] = "balanced"
    sale_date: Optional[str] = None
    yield_kg_per_mu: float = Field(ge=0)
    cost_per_mu: float = Field(ge=0)
    sale_price_per_kg: float = Field(ge=0)
    sale_fraction: float = Field(ge=0, le=1)
    price_is_user: bool = True
    as_of: Optional[str] = None

    @field_validator("crop")
    @classmethod
    def valid_crop(cls, value):
        if not re.fullmatch(r"[\u4e00-\u9fffA-Za-z0-9·\-]{1,12}", value):
            raise ValueError("请选择或填写有效作物名称。")
        return value

    @field_validator("sale_date", "as_of")
    @classmethod
    def valid_date(cls, value):
        if value is not None and (len(value) != 10 or date.fromisoformat(value).isoformat() != value):
            raise ValueError("日期需要使用有效的 YYYY-MM-DD。")
        return value


class ProductWindow(BaseModel):
    model_config = ConfigDict(extra="forbid")
    start: str
    end: str


class ProductCandidate(BaseModel):
    model_config = ConfigDict(extra="forbid", allow_inf_nan=False)
    id: str
    crop: str
    area_mu: float
    price_per_kg: float
    horizon_days: Optional[int]
    sales_window: Optional[ProductWindow]
    revenue_cny: float
    cost_cny: float
    profit_cny: float
    break_even_price: Optional[float]
    risk: Literal["低", "中等", "高"]
    reasons: List[str]


class ProductRecommendation(BaseModel):
    model_config = ConfigDict(extra="forbid")
    candidate_id: Optional[str]
    reasons: List[str]


class ProductDecisionResponse(BaseModel):
    model_config = ConfigDict(extra="forbid", allow_inf_nan=False)
    contract_version: Literal["product-1"]
    request: ProductDecisionRequest
    context_hash: str
    candidates: List[ProductCandidate]
    recommendation: ProductRecommendation
    origin: Dict[str, Any]
