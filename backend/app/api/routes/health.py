"""Health check."""
from fastapi import APIRouter

router = APIRouter(tags=["health"])


@router.get("/health")
def health():
    # The smallest possible endpoint: proves the server runs and routing works.
    return {"status": "ok"}
