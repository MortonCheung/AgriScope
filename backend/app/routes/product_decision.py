import asyncio
from fastapi import APIRouter, Request, Response
from ..product_schemas import ProductDecisionRequest, ProductDecisionResponse
from ..services import product_decision_service as service

router = APIRouter(tags=["decision"])

@router.post("/api/product/decision", response_model=ProductDecisionResponse,
             summary="农业产品决策：本城模型、区域参考与受约束方案选择")
async def decide(request: ProductDecisionRequest, http: Request):
    work = asyncio.create_task(service.evaluate(request))
    try:
        while not work.done():
            await asyncio.wait([work], timeout=.2)
            if not work.done() and await http.is_disconnected():
                work.cancel()
                return Response(status_code=499)
        return await work
    finally:
        if not work.done():
            work.cancel()
