from fastapi import FastAPI

from app.routers import health, predict

app = FastAPI(
    title="ML Service",
    description="Inference API for the ML Portfolio",
    version="0.1.0",
)

app.include_router(health.router)
app.include_router(predict.router)


@app.get("/")
async def root() -> dict:
    return {"service": "ml-service", "status": "ok"}
