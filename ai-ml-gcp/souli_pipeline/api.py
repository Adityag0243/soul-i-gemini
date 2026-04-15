"""
Souli REST API — FastAPI server for mobile app integration
=========================================================

Endpoints:
  POST /chat              — text message → text reply
  POST /voice             — audio file upload → text reply + audio bytes
  POST /session/reset     — reset conversation state for a session
  GET  /session/{id}/state — get current phase, energy_node, turn count
  GET  /health            — check if API + Ollama + Qdrant are all up

In Docker (GCP):
  "gunicorn", "souli_pipeline.api:app",
          "--worker-class", "uvicorn.workers.UvicornWorker",
          "--workers", "3",
          "--bind", "0.0.0.0:8000",
          "--timeout", "120"
          
    New Addition.....
    POST  /gemini/session/greeting      → get opening greeting (Gemini session)
    POST  /gemini/chat                  → text message → Gemini reply
    POST  /gemini/session/reset         → reset a Gemini session
    GET   /gemini/session/{id}/state    → get current Gemini session state
    GET   /gemini/health                → check Gemini + MongoDB connectivity

"""
from __future__ import annotations

import io
import logging
import os
import tempfile
from pathlib import Path
from typing import Dict, Optional

from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response
from pydantic import BaseModel

# ── Logging ───────────────────────────────────────────────────────────────────

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# ── Config paths (same env vars as streamlit_app.py) ─────────────────────────

CONFIG_PATH = os.environ.get(
    "SOULI_CONFIG_PATH",
    str(Path(__file__).parent.parent / "configs" / "pipeline.gcp.yaml"),
)
GOLD_PATH = os.environ.get("SOULI_GOLD_PATH", None)
_default_excel = str(Path(__file__).parent / "data" / "Souli_EnergyFramework_PW (1).xlsx")
EXCEL_PATH = os.environ.get(
    "SOULI_EXCEL_PATH",
    _default_excel if os.path.exists(_default_excel) else None,
)

# ── App ───────────────────────────────────────────────────────────────────────

app = FastAPI(
    title="Souli API",
    description="REST API for Souli wellness companion — connects chat and voice to your mobile app",
    version="1.0.0",
)

# Allow any origin so the mobile app (React Native / Flutter) can call freely.
# Tighten this to your domain in production.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Session store ─────────────────────────────────────────────────────────────
# Maps session_id (string) → ConversationEngine instance
# Each user/device should use a unique session_id (UUID from the mobile app).
# Simple in-memory store — good for single-server GCP VM.
# If you scale to multiple replicas later, replace with Redis.

_sessions: Dict[str, object] = {}


def _get_or_create_engine(session_id: str):
    """Return existing engine for session or create a fresh one."""
    if session_id not in _sessions:
        logger.info("Creating new engine for session: %s", session_id)
        from souli_pipeline.config_loader import load_config
        from souli_pipeline.conversation.engine import ConversationEngine

        cfg = load_config(CONFIG_PATH)

        # Auto-find newest gold.xlsx if not set via env var
        gold_path = GOLD_PATH
        if not gold_path and os.path.exists("outputs"):
            runs = sorted(
                [r for r in os.listdir("outputs") if os.path.isdir(os.path.join("outputs", r))],
                reverse=True,
            )
            for r in runs:
                gp = os.path.join("outputs", r, "energy", "gold.xlsx")
                if os.path.exists(gp):
                    gold_path = gp
                    break

        _sessions[session_id] = ConversationEngine.from_config(
            cfg,
            gold_path=gold_path,
            excel_path=EXCEL_PATH,
        )

    return _sessions[session_id]


# ── Cached STT / TTS (loaded once per process) ───────────────────────────────

_stt = None
_tts = None


def _get_stt():
    global _stt
    if _stt is None:
        from souli_pipeline.voice.stt import WhisperSTT
        _stt = WhisperSTT(model_name=os.environ.get("WHISPER_MODEL", "base"))
    return _stt


def _get_tts():
    global _tts
    if _tts is None:
        from souli_pipeline.voice.tts import EdgeTTS
        _tts = EdgeTTS(voice=os.environ.get("TTS_VOICE", "en-IN-NeerjaNeural"))
    return _tts


# ── Request / Response models ─────────────────────────────────────────────────

class ChatRequest(BaseModel):
    session_id: str
    message: str

    class Config:
        json_schema_extra = {
            "example": {
                "session_id": "user-abc-123",
                "message": "I've been feeling really overwhelmed lately",
            }
        }


class ChatResponse(BaseModel):
    session_id: str
    reply: str
    phase: str
    energy_node: Optional[str]
    turn_count: int


class SessionState(BaseModel):
    session_id: str
    phase: str
    energy_node: Optional[str]
    turn_count: int
    intent: Optional[str]
    user_name: Optional[str]


class ResetResponse(BaseModel):
    session_id: str
    status: str
    greeting: str


class HealthResponse(BaseModel):
    status: str
    ollama: str
    qdrant: str
    config_loaded: bool


# ═════════════════════════════════════════════════════════════════════════════
# ENDPOINTS
# ═════════════════════════════════════════════════════════════════════════════

# ── 1. Text Chat ──────────────────────────────────────────────────────────────

@app.post("/chat", response_model=ChatResponse, summary="Send a text message to Souli")
def chat(req: ChatRequest):
    """
    Send a text message and get Souli's response.

    - **session_id**: unique identifier for this user's conversation (e.g. device UUID)
    - **message**: what the user typed

    Returns the reply text plus current conversation state metadata.
    """
    if not req.message.strip():
        raise HTTPException(status_code=400, detail="message cannot be empty")

    engine = _get_or_create_engine(req.session_id)

    try:
        reply = engine.turn(req.message)
    except Exception as exc:
        logger.error("Engine error for session %s: %s", req.session_id, exc)
        raise HTTPException(status_code=500, detail=f"Engine error: {exc}")

    diag = engine.diagnosis_summary
    return ChatResponse(
        session_id=req.session_id,
        reply=reply,
        phase=engine.state.phase,
        energy_node=diag.get("energy_node"),
        turn_count=engine.state.turn_count,
    )




def _safe_header(text: str) -> str:
    """Strip non-latin-1 chars so HTTP headers don't blow up on em-dashes, smart quotes etc."""
    return text.encode("latin-1", errors="replace").decode("latin-1")

# ── 2. Voice Chat ─────────────────────────────────────────────────────────────

@app.post(
    "/voice",
    summary="Send a voice recording, get back text + audio",
    responses={
        200: {
            "content": {"audio/mpeg": {}},
            "description": "MP3 audio of Souli's spoken reply",
        }
    },
)
async def voice(
    session_id: str = Form(..., description="Unique session ID for this user"),
    audio: UploadFile = File(..., description="Audio recording (.wav, .mp3, .webm, .m4a)"),
):
    """
    Upload a voice recording. Returns:
    - `X-Transcript` header — what Souli heard you say
    - `X-Reply` header — Souli's text reply
    - `X-Phase` header — current conversation phase
    - Response body — MP3 audio of Souli's spoken reply

    The mobile app should:
    1. POST the audio file with form-data
    2. Read the headers for text display
    3. Play the response body as audio
    """
    # Save uploaded audio to a temp file
    suffix = Path(audio.filename or "audio.wav").suffix or ".wav"
    with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as tmp:
        tmp.write(await audio.read())
        tmp_path = tmp.name

    try:
        # STT: transcribe audio
        stt = _get_stt()
        transcript = stt.transcribe_file(tmp_path)
    except Exception as exc:
        os.unlink(tmp_path)
        logger.error("STT error: %s", exc)
        raise HTTPException(status_code=500, detail=f"Transcription failed: {exc}")
    finally:
        if os.path.exists(tmp_path):
            os.unlink(tmp_path)

    if not transcript.strip():
        raise HTTPException(status_code=422, detail="Could not transcribe audio — please try again")

    # Conversation engine turn
    engine = _get_or_create_engine(session_id)
    try:
        reply = engine.turn(transcript)
    except Exception as exc:
        logger.error("Engine error for session %s: %s", session_id, exc)
        raise HTTPException(status_code=500, detail=f"Engine error: {exc}")

    # TTS: synthesize reply to audio
    try:
        tts = _get_tts()
        audio_bytes = await tts.synthesize_async(reply)
    except Exception as exc:
        logger.error("TTS error: %s", exc)
        # Don't fail the whole request — return the text in headers even if TTS breaks
        audio_bytes = b"not able to synthesize the audio do check api dot py"

    diag = engine.diagnosis_summary
    return Response(
        content=audio_bytes,
        media_type="audio/mpeg",
        headers={
            "X-Transcript": _safe_header(transcript),
            "X-Reply": _safe_header(reply),
            "X-Phase": engine.state.phase,
            "X-Energy-Node": _safe_header(diag.get("energy_node") or ""),
            "X-Turn-Count": str(engine.state.turn_count),
            "Access-Control-Expose-Headers": (
                "X-Transcript, X-Reply, X-Phase, X-Energy-Node, X-Turn-Count"
            ),
        },
    )


# ── 3. Reset Session ──────────────────────────────────────────────────────────

@app.post("/session/reset", response_model=ResetResponse, summary="Start a fresh conversation")
def reset_session(session_id: str = Form(...)):
    """
    Reset the conversation state for a session.
    Call this when the user taps "New Session" in the mobile app.
    Returns the greeting message so the app can display it immediately.
    """
    if session_id in _sessions:
        _sessions[session_id].reset()
        engine = _sessions[session_id]
    else:
        engine = _get_or_create_engine(session_id)

    greeting = engine.greeting()
    return ResetResponse(
        session_id=session_id,
        status="reset",
        greeting=greeting,
    )


# ── 4. Session State ──────────────────────────────────────────────────────────

@app.get("/session/{session_id}/state", response_model=SessionState, summary="Get current session state")
def get_session_state(session_id: str):
    """
    Get the current conversation state for a session.
    Useful for the mobile app to show progress indicators or debug.
    """
    if session_id not in _sessions:
        raise HTTPException(status_code=404, detail=f"Session '{session_id}' not found")

    engine = _sessions[session_id]
    diag = engine.diagnosis_summary
    return SessionState(
        session_id=session_id,
        phase=engine.state.phase,
        energy_node=diag.get("energy_node"),
        turn_count=engine.state.turn_count,
        intent=engine.state.intent,
        user_name=engine.state.user_name,
    )


# ── 5. Health Check ───────────────────────────────────────────────────────────

    import time

    # Module-level cache — lives for the lifetime of each worker process
    _health_cache = {
        "status": None,
        "ollama": "unknown", 
        "qdrant": "unknown",
        "config_loaded": False,
        "last_checked": 0,
    }
    _HEALTH_CACHE_TTL = 60  # only re-check every 60 seconds per worker

    @app.get("/health", response_model=HealthResponse, summary="Check API + service health")
    def health():
        global _health_cache
        
        now = time.time()
        # Return cached result if checked recently
        if _health_cache["status"] is not None and (now - _health_cache["last_checked"]) < _HEALTH_CACHE_TTL:
            overall = _health_cache["status"]
            response_status = 200 if overall == "ok" else 503
            return Response(
                content=HealthResponse(
                    status=overall,
                    ollama=_health_cache["ollama"],
                    qdrant=_health_cache["qdrant"],
                    config_loaded=_health_cache["config_loaded"],
                ).model_dump_json(),
                media_type="application/json",
                status_code=response_status,
            )

        # Cache expired — do the real check
        ollama_status = "unknown"
        qdrant_status = "unknown"
        config_loaded = False

        try:
            from souli_pipeline.config_loader import load_config
            load_config(CONFIG_PATH)
            config_loaded = True
        except Exception as exc:
            logger.warning("Config load failed: %s", exc)

        try:
            from souli_pipeline.llm.ollama import OllamaLLM
            ollama_endpoint = os.environ.get("OLLAMA_ENDPOINT", "http://localhost:11434")
            llm = OllamaLLM(endpoint=ollama_endpoint)
            ollama_status = "ok" if llm.is_available() else "unreachable"
        except Exception:
            ollama_status = "error"

        try:
            from qdrant_client import QdrantClient
            from souli_pipeline.config_loader import load_config
            cfg = load_config(CONFIG_PATH)
            qc = QdrantClient(
                host=cfg.retrieval.qdrant_host,
                port=cfg.retrieval.qdrant_port,
                timeout=3,
            )
            qc.get_collections()
            qdrant_status = "ok"
        except Exception:
            qdrant_status = "unreachable"

        overall = "ok" if (ollama_status == "ok" and qdrant_status == "ok") else "degraded"

        # Update cache
        _health_cache.update({
            "status": overall,
            "ollama": ollama_status,
            "qdrant": qdrant_status,
            "config_loaded": config_loaded,
            "last_checked": now,
        })

        response_status = 200 if overall == "ok" else 503
        return Response(
            content=HealthResponse(
                status=overall,
                ollama=ollama_status,
                qdrant=qdrant_status,
                config_loaded=config_loaded,
            ).model_dump_json(),
            media_type="application/json",
            status_code=response_status,
        )
# ── 6. Greeting (convenience for first-open in mobile app) ───────────────────

@app.post("/session/greeting", response_model=ChatResponse, summary="Get opening greeting for a new session")
def greeting(session_id: str = Form(...)):
    """
    Get Souli's opening greeting for a brand new session.
    Call this when the user opens the app for the first time or after a reset.
    """
    engine = _get_or_create_engine(session_id)
    greet_text = engine.greeting()
    return ChatResponse(
        session_id=session_id,
        reply=greet_text,
        phase=engine.state.phase,
        energy_node=None,
        turn_count=0,
    )



# gemini part api
import os as _os
from souli_pipeline.conversation.gemini_engine import GeminiEngine
from souli_pipeline.storage import mongo_store as _mongo
 
# ── Gemini session store (same pattern as existing _sessions dict) ─────────────
# Maps session_id → GeminiEngine instance
# One engine per session — holds in-memory state between turns
_gemini_sessions: Dict[str, GeminiEngine] = {}
 
 
def _get_or_create_gemini_engine(session_id: str) -> GeminiEngine:
    """Return existing Gemini engine for session, or create a fresh one."""
    if session_id not in _gemini_sessions:
        engine = GeminiEngine.from_config(_load_config())
        engine.new_session(session_id)
        _gemini_sessions[session_id] = engine
        logger.info("Gemini session created: %s", session_id)
    return _gemini_sessions[session_id]
 
 
def _load_config():
    """Load pipeline config — reuses same path logic as existing engine setup."""
    from souli_pipeline.config_loader import load_config
    cfg_path = CONFIG_PATH  # reuses the existing CONFIG_PATH from top of api.py
    return load_config(cfg_path)
 
 
# ── 1. Gemini Greeting ─────────────────────────────────────────────────────────
 
@app.post(
    "/gemini/session/greeting",
    summary="[Gemini] Get opening greeting",
)
def gemini_greeting(session_id: str = Form(...)):
    """
    Start a new Gemini session and get the opening greeting.
    Creates a fresh session in memory and MongoDB.
    """
    engine = _get_or_create_gemini_engine(session_id)
 
    # If session already has turns, reset it for a fresh start
    if engine.state and engine.state.turn_count > 0:
        engine.new_session(session_id)
 
    greeting = engine.greeting()
    return {
        "session_id": session_id,
        "greeting":   greeting,
        "engine":     "gemini",
        "phase":      "greeting",
    }
 
 
# ── 2. Gemini Chat ─────────────────────────────────────────────────────────────
 
@app.post(
    "/gemini/chat",
    response_model=ChatResponse,       # reuses existing ChatResponse model
    summary="[Gemini] Send a text message to Souli (Gemini version)",
)
def gemini_chat(req: ChatRequest):    # reuses existing ChatRequest model
    """
    Send a text message and get Souli's response (powered by Gemini).
 
    - **session_id**: unique identifier for this conversation
    - **message**: what the user typed
 
    Returns the same ChatResponse format as /chat so mobile app needs
    minimal changes to test this endpoint.
    """
    if not req.message.strip():
        raise HTTPException(status_code=400, detail="message cannot be empty")
 
    engine = _get_or_create_gemini_engine(req.session_id)
 
    try:
        reply = engine.turn(req.message, session_id=req.session_id)
    except Exception as exc:
        logger.error("Gemini engine error for session %s: %s", req.session_id, exc)
        raise HTTPException(status_code=500, detail=f"Gemini engine error: {exc}")
 
    diag = engine.diagnosis_summary
 
    return ChatResponse(
        session_id  = req.session_id,
        reply       = reply,
        phase       = engine.state.phase if engine.state else "unknown",
        energy_node = diag.get("energy_node"),
        turn_count  = diag.get("turn_count", 0),
    )
 
 
# ── 3. Gemini Session Reset ────────────────────────────────────────────────────
 
@app.post(
    "/gemini/session/reset",
    summary="[Gemini] Reset a Gemini conversation session",
)
def gemini_session_reset(session_id: str = Form(...)):
    """
    Reset a Gemini session — starts a fresh conversation.
    Creates a new MongoDB document for the new session.
    """
    # Create fresh engine for this session_id
    engine = GeminiEngine.from_config(_load_config())
    engine.new_session(session_id)
    _gemini_sessions[session_id] = engine
 
    greeting = engine.greeting()
    return {
        "session_id": session_id,
        "greeting":   greeting,
        "engine":     "gemini",
        "status":     "reset",
    }
 
 
# ── 4. Gemini Session State ────────────────────────────────────────────────────
 
@app.get(
    "/gemini/session/{session_id}/state",
    summary="[Gemini] Get current Gemini session state",
)
def gemini_session_state(session_id: str):
    """
    Get the current state of a Gemini session.
    Returns phase, energy_node, turn_count, commitment_status, etc.
    """
    if session_id not in _gemini_sessions:
        raise HTTPException(
            status_code=404,
            detail=f"Gemini session '{session_id}' not found. "
                   f"Start one with POST /gemini/session/greeting",
        )
    engine = _gemini_sessions[session_id]
    return {
        **engine.diagnosis_summary,
        "engine": "gemini",
        "solution_step": (
            engine.state.solution_step if engine.state else None
        ),
        "solution_complete": (
            engine.state.solution_complete if engine.state else False
        ),
    }
 
 
# ── 5. Gemini Health Check ─────────────────────────────────────────────────────
 
@app.get(
    "/gemini/health",
    summary="[Gemini] Health check — Gemini API + MongoDB",
)
def gemini_health():
    """
    Check if Gemini API key is configured and MongoDB is reachable.
    Does NOT make a real Gemini API call (saves cost) — just checks config.
    """
    gemini_key_set = bool(_os.environ.get("GEMINI_API_KEY", "").strip())
    mongo_ok       = _mongo.is_connected()
 
    active_sessions = len(_gemini_sessions)
 
    status = "ok" if (gemini_key_set and mongo_ok) else "degraded"
 
    return {
        "status":              status,
        "gemini_key_set":      gemini_key_set,
        "mongodb_connected":   mongo_ok,
        "active_sessions":     active_sessions,
        "flash_model":         _os.environ.get("GEMINI_FLASH_MODEL", "gemini-2.5-flash-preview-05-20"),
        "pro_model":           _os.environ.get("GEMINI_PRO_MODEL",   "gemini-2.5-pro-preview-05-06"),
        "engine":              "gemini",
    }
