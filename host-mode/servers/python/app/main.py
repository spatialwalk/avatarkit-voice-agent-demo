from __future__ import annotations

from pathlib import Path
import logging

from fastapi import FastAPI, WebSocket
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles

from app.config import get_settings, validate_settings
from app.session import BrowserSession


logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s: %(message)s",
)

settings = get_settings()
app = FastAPI(title="SpatialReal Host Mode Demo")
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_allow_origins or ["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/healthz")
async def healthz() -> JSONResponse:
    missing = validate_settings(settings)
    return JSONResponse({"ok": not missing, "missing": missing})


@app.get("/api/config")
async def config() -> JSONResponse:
    missing = validate_settings(settings)
    if missing:
        return JSONResponse({"error": "missing_env", "missing": missing}, status_code=500)
    return JSONResponse(settings.public_avatar_config)


@app.websocket("/ws/agent")
async def agent_websocket(websocket: WebSocket) -> None:
    session = BrowserSession(websocket, settings)
    await session.run()


frontend_dist = Path(__file__).resolve().parents[2] / "frontend" / "dist"
if frontend_dist.exists():
    app.mount("/", StaticFiles(directory=frontend_dist, html=True), name="frontend")
