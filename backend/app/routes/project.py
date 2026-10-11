from fastapi import APIRouter, Response
from ..services import project_service
router = APIRouter(tags=["meta"])
@router.get("/api/project/evidence", summary="冻结模型与时间切分证据（只读）")
def evidence(response: Response):
    response.headers["Cache-Control"] = "no-store"
    return project_service.evidence()
