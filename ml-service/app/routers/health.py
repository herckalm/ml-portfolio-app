import os
import asyncpg
from fastapi import APIRouter

router = APIRouter(prefix="/health", tags=["health"])


@router.get("")
async def health_check() -> dict:
    return {"status": "healthy"}


@router.get("/db")
async def db_health_check() -> dict:
    dsn = (
        f"postgresql://{os.getenv('POSTGRES_USER', 'mluser')}"
        f":{os.getenv('POSTGRES_PASSWORD', 'mlpassword_dev')}"
        f"@{os.getenv('POSTGRES_HOST', 'localhost')}"
        f":5432/{os.getenv('POSTGRES_DB', 'ml_portfolio')}"
    )
    try:
        conn = await asyncpg.connect(dsn, timeout=5)
        await conn.execute("SELECT 1")
        await conn.close()
        return {"status": "healthy", "db": "reachable"}
    except Exception as e:
        return {"status": "unhealthy", "db": str(e)}
