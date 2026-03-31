import asyncio
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger

from config import get_settings
from database import init_db, SessionLocal
from models import BotSettings
from services.trading_engine import engine

logging.basicConfig(
    level=getattr(logging, get_settings().log_level),
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger(__name__)

scheduler = AsyncIOScheduler()


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    init_db()
    logger.info("Database initialized")

    # Setup scheduler
    engine.set_scheduler(scheduler)

    # Read interval from DB
    db = SessionLocal()
    try:
        settings = db.query(BotSettings).filter(BotSettings.id == 1).first()
        interval = settings.analysis_interval if settings else "1h"
    finally:
        db.close()

    if interval == "15m":
        trigger = CronTrigger(minute="*/15")
    else:
        trigger = CronTrigger(minute="0")

    scheduler.add_job(
        engine._run_cycle_wrapper,
        trigger,
        id="analysis_cycle",
        replace_existing=True,
    )
    scheduler.start()
    logger.info(f"Scheduler started with {interval} interval")

    yield

    # Shutdown
    scheduler.shutdown()
    await engine.exchange.close()
    logger.info("Application shutdown complete")


app = FastAPI(
    title="AI Crypto Trading Bot",
    description="Automated cryptocurrency trading with AI-powered analysis",
    version="1.0.0",
    lifespan=lifespan,
)

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=get_settings().cors_origins_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Import and include routers
from routers.trading import router as trading_router
from routers.positions import router as positions_router
from routers.settings import router as settings_router
from routers.analysis import router as analysis_router
from routers.account import router as account_router

app.include_router(trading_router)
app.include_router(positions_router)
app.include_router(settings_router)
app.include_router(analysis_router)
app.include_router(account_router)


@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await engine.ws_manager.connect(websocket)
    try:
        while True:
            # Keep connection alive, receive any client messages
            data = await websocket.receive_text()
            # Client can send ping/pong or commands
            if data == "ping":
                await websocket.send_text("pong")
    except WebSocketDisconnect:
        engine.ws_manager.disconnect(websocket)
    except Exception:
        engine.ws_manager.disconnect(websocket)


@app.get("/api/health")
async def health_check():
    from database import SessionLocal
    from models import BotSettings
    health = {"status": "ok", "version": "1.0.0"}
    try:
        db = SessionLocal()
        db.query(BotSettings).first()
        db.close()
        health["database"] = "connected"
    except Exception as e:
        health["database"] = f"error: {e}"
        health["status"] = "degraded"
    health["scheduler"] = "running" if scheduler.running else "stopped"
    health["bot_running"] = engine.is_running
    return health


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
