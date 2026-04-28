"""
Souli REST API — FastAPI server for mobile app integration
=========================================================

Endpoints:
  POST /chat              — text message → text reply
  POST /chat/stream       — text message → SSE streaming reply (T9)
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
from dotenv import load_dotenv
load_dotenv()
import asyncio
import io
import json as _json
import logging
import os
import uuid
import jwt 
import tempfile
from pathlib import Path
from typing import Any, AsyncGenerator, Dict, List, Optional

from fastapi import FastAPI, File, Form, HTTPException, Request, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, Response, StreamingResponse
from pydantic import BaseModel
from starlette.middleware.base import BaseHTTPMiddleware

from souli_pipeline.storage import mongo_store as _mongo

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

from fastapi.security import HTTPBearer, APIKeyHeader

# These show up as the "Authorize" button in Swagger UI
_api_key_header = APIKeyHeader(name="X-Internal-API-Key", auto_error=False)
_bearer_scheme = HTTPBearer(auto_error=False)

app = FastAPI(
    title="Souli API",
    description="REST API for Souli wellness companion — connects chat and voice to your mobile app",
    version="1.0.0",
    swagger_ui_parameters={"persistAuthorization": True},  # keeps your tokens after page refresh
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

# ── Auth Middleware (Internal API Key + JWT Bearer) ──────────────────────────
# Two layers:
#   1. X-Internal-API-Key header — proves request is from the real Souli app
#   2. Authorization: Bearer <JWT> — proves which user is making the request
#
# Both are required on every request except exempt paths.
# The JWT is RS256-signed by the backend; we verify with the public key only.

_INTERNAL_API_KEY = os.environ.get("INTERNAL_API_KEY", "").strip()
# _JWT_PUBLIC_KEY = os.environ.get("JWT_PUBLIC_KEY", "").replace("\\n", "\n").strip()
_JWT_PUBLIC_KEY = os.environ.get("JWT_PUBLIC_KEY", "").replace("\\n", "\n").strip()
_JWT_ISSUER = os.environ.get("JWT_ISSUER", os.environ.get("TOKEN_ISSUER", "")).strip()
_JWT_AUDIENCE = os.environ.get("JWT_AUDIENCE", os.environ.get("TOKEN_AUDIENCE", "")).strip()
_AUTH_EXEMPT_PATHS = {"/health", "/gemini/health", "/docs", "/openapi.json", "/redoc"}


def _decode_jwt(token: str) -> dict:
    """
    Verify and decode a JWT access token using the backend's RSA public key.
    Returns the decoded payload dict with keys: sub, iss, aud, exp, iat, prm.
    Raises HTTPException on any failure.
    """
    if not _JWT_PUBLIC_KEY:
        raise HTTPException(
            status_code=500,
            detail="JWT_PUBLIC_KEY not configured on AI server",
        )
    try:
        payload = jwt.decode(
            token,
            _JWT_PUBLIC_KEY,
            algorithms=["RS256"],
            issuer=_JWT_ISSUER or None,
            audience=_JWT_AUDIENCE or None,
        )
        return payload
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token has expired")
    except jwt.InvalidTokenError as exc:
        raise HTTPException(status_code=401, detail=f"Invalid token: {exc}")


class AuthMiddleware(BaseHTTPMiddleware):
    """
    Combined auth middleware — checks both layers on every request.

    Layer 1: X-Internal-API-Key header must match INTERNAL_API_KEY env var.
             If INTERNAL_API_KEY env is empty → skip this check (dev mode).

    Layer 2: Authorization: Bearer <JWT> must be a valid RS256 token.
             Extracts user_id from JWT "sub" claim.

    On success, sets:
      - request.state.user_id      (int)  — from JWT "sub" claim
      - request.state.jwt_payload  (dict) — full decoded JWT payload
    """

    async def dispatch(self, request: Request, call_next):
        # Skip auth for exempt paths and CORS preflight
        if request.url.path in _AUTH_EXEMPT_PATHS or request.method == "OPTIONS":
            return await call_next(request)

        # ── Layer 1: Internal API Key ──
        if _INTERNAL_API_KEY:
            api_key = request.headers.get("x-internal-api-key", "")
            if api_key != _INTERNAL_API_KEY:
                return JSONResponse(
                    status_code=403,
                    content={"detail": "Invalid or missing X-Internal-API-Key"},
                )

        # ── Layer 2: JWT Bearer Token ──
        auth_header = request.headers.get("authorization", "")
        if not auth_header.startswith("Bearer "):
            return JSONResponse(
                status_code=401,
                content={
                    "detail": "Missing or invalid Authorization header. "
                              "Expected: Bearer <token>"
                },
            )

        token = auth_header[7:]  # strip "Bearer "
        try:
            payload = _decode_jwt(token)
        except HTTPException as exc:
            return JSONResponse(
                status_code=exc.status_code,
                content={"detail": exc.detail},
            )

        # Validate sub claim — must be a numeric user_id
        sub = payload.get("sub")
        if not sub or not str(sub).isdigit():
            return JSONResponse(
                status_code=401,
                content={"detail": "Invalid token: missing or non-numeric user ID"},
            )

        # Attach to request state — endpoints read from here
        request.state.user_id = int(sub)
        request.state.jwt_payload = payload

        # Pass through request_id if present (for tracing)
        request_id = request.headers.get("x-request-id")
        if request_id:
            logger.info(
                "req %s %s [user_id=%s, request_id=%s]",
                request.method, request.url.path, sub, request_id,
            )

        response = await call_next(request)

        if request_id:
            response.headers["X-Request-Id"] = request_id
        return response


app.add_middleware(AuthMiddleware)

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
    user_id: Optional[str] = None  # always null in v1 (D11 — anonymous on AI side)
    phase: str
    energy_node: Optional[str] = None
    secondary_node: Optional[str] = None
    node_reasoning: Optional[str] = None
    commitment_status: Optional[str] = None
    turn_count: int
    intent: Optional[str] = None
    user_name: Optional[str] = None
    solution_step: Optional[int] = None
    solution_complete: bool = False
    solution_steps_history: List[Dict[str, Any]] = []
    three_day_task: Optional[Any] = None  # populated by Phase 13 webhook flow
    rag_sources_used: List[Dict[str, Any]] = []
    last_updated_at: Optional[str] = None


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

    engine = _get_or_create_gemini_engine(req.session_id)  # <-- use Gemini engine for /chat as well

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


# ── 1b. Streaming Text Chat (T9) ────────────────────────────────────────────

def _chunk_text(text: str, max_chars: int = 40) -> List[str]:
    """Break text into word-boundary chunks for SSE streaming."""
    words = text.split(" ")
    chunks: List[str] = []
    current = ""
    for word in words:
        candidate = f"{current} {word}".strip() if current else word
        if len(candidate) > max_chars and current:
            chunks.append(current)
            current = word
        else:
            current = candidate
    if current:
        chunks.append(current)
    return chunks or [text]


@app.post("/chat/stream", summary="[SSE] Send a text message, receive streaming reply")
async def chat_stream(req: ChatRequest):
    """
    SSE streaming version of /chat. Same input, streamed output.

    Events emitted (one per SSE frame):
      - **chunk**:    `{"text": "..."}` — incremental reply text
      - **metadata**: `{phase, energy_node, secondary_node, node_reasoning, turn_count, solution_step, solution_complete}` — AI metadata after full reply
      - **done**:     `{"session_id": "...", "full_reply": "..."}` — stream complete
      - **error**:    `{"message": "..."}` — on failure (terminal)
    """
    if not req.message.strip():
        raise HTTPException(status_code=400, detail="message cannot be empty")

    engine = _get_or_create_gemini_engine(req.session_id)

    async def _sse() -> AsyncGenerator[str, None]:
        try:
            reply = engine.turn(req.message, session_id=req.session_id)
            diag = engine.diagnosis_summary

            for chunk in _chunk_text(reply, max_chars=40):
                yield f"event: chunk\ndata: {_json.dumps({'text': chunk})}\n\n"
                await asyncio.sleep(0)

            metadata = {
                "phase": engine.state.phase if engine.state else "unknown",
                "energy_node": diag.get("energy_node"),
                "secondary_node": diag.get("secondary_node"),
                "node_reasoning": diag.get("node_reasoning"),
                "turn_count": diag.get("turn_count", 0),
                "solution_step": engine.state.solution_step if engine.state else None,
                "solution_complete": engine.state.solution_complete if engine.state else False,
            }
            yield f"event: metadata\ndata: {_json.dumps(metadata)}\n\n"

            yield f"event: done\ndata: {_json.dumps({'session_id': req.session_id, 'full_reply': reply})}\n\n"

        except Exception as exc:
            logger.error("Stream error for session %s: %s", req.session_id, exc)
            yield f"event: error\ndata: {_json.dumps({'message': str(exc)})}\n\n"

    return StreamingResponse(
        _sse(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


@app.get("/health", summary="Health check")
def health():
    return {"status": "ok", "engine": "gemini"}

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
    engine = _get_or_create_gemini_engine(session_id)
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
def reset_session(
    request: Request,
    session_id: str = Form(...),
):
    user_id = request.state.user_id
    user_name = None

    old_engine = _gemini_sessions.get(session_id)
    if old_engine and old_engine.state:
        user_name = old_engine.state.user_name

    new_session_id = str(uuid.uuid4())
    engine = _get_or_create_gemini_engine(
        session_id=new_session_id,
        user_id=user_id,
        user_name=user_name,
    )
    greet_text = engine.greeting(user_name=user_name)

    # Clean up old session from memory
    if session_id in _gemini_sessions:
        del _gemini_sessions[session_id]
    if session_id in _sessions:
        del _sessions[session_id]

    return ResetResponse(
        session_id=new_session_id,
        status="reset",
        greeting=greet_text,
    )

# ── 4. Session State ──────────────────────────────────────────────────────────

@app.get("/session/{session_id}/state", response_model=SessionState, summary="Get current session state")
def get_session_state(session_id: str):
    """
    Get the current conversation state for a session.
    Returns full AI metadata — phase, energy nodes, commitment status,
    solution progress, RAG sources, last-update timestamp. Used by the
    backend to proxy AI state to mobile via GET /chat/sessions/{id}/ai-state.
    """
    # /chat puts sessions in _gemini_sessions; the previous implementation
    # only checked the legacy _sessions store, so it 404'd for every active
    # session. Check both, prefer Gemini.
    gemini_engine = _gemini_sessions.get(session_id)
    legacy_engine = _sessions.get(session_id) if gemini_engine is None else None

    if gemini_engine is None and legacy_engine is None:
        raise HTTPException(status_code=404, detail=f"Session '{session_id}' not found")

    # Pull persisted metadata (user_id is always null per D11; _last_updated
    # for cache freshness signals on mobile). Document may not exist yet for
    # an in-memory-only legacy session.
    mongo_doc = _mongo.get_session(session_id) or {}
    metadata = mongo_doc.get("session_metadata", {})

    if gemini_engine is not None:
        state = gemini_engine.state
        diag = gemini_engine.diagnosis_summary
        return SessionState(
            session_id=session_id,
            user_id=metadata.get("user_id"),
            phase=diag.get("phase") or (state.phase if state else "greeting"),
            energy_node=state.energy_node if state else None,
            secondary_node=state.secondary_node if state else None,
            node_reasoning=state.node_reasoning if state else None,
            commitment_status=state.commitment_status if state else None,
            turn_count=state.turn_count if state else 0,
            intent=None,      # gemini engine doesn't track intent
            user_name=None,   # gemini engine doesn't track user_name
            solution_step=state.solution_step if state else None,
            solution_complete=state.solution_complete if state else False,
            solution_steps_history=state.solution_steps_history if state else [],
            three_day_task=None,  # Phase 13 webhook flow surfaces this later
            rag_sources_used=state.solution_rag_chunks if state else [],
            last_updated_at=mongo_doc.get("_last_updated"),
        )

    # Legacy ConversationEngine fallback
    diag = legacy_engine.diagnosis_summary
    return SessionState(
        session_id=session_id,
        user_id=metadata.get("user_id"),
        phase=legacy_engine.state.phase,
        energy_node=diag.get("energy_node"),
        secondary_node=diag.get("secondary_node"),
        node_reasoning=diag.get("node_reasoning"),
        commitment_status=None,
        turn_count=legacy_engine.state.turn_count,
        intent=legacy_engine.state.intent,
        user_name=legacy_engine.state.user_name,
        last_updated_at=mongo_doc.get("_last_updated"),
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

from fastapi import Depends

@app.post("/session/greeting", summary="Get opening greeting for a new session")
def greeting(
    request: Request,
    user_name: str = Form(default="buddy"),
    _api_key: str = Depends(_api_key_header), 
    _bearer: str = Depends(_bearer_scheme),
):
    """
    Start a new Souli session. Call this when user opens the app or taps "New Chat".

    Headers required:
      - Authorization: Bearer <accessToken>
      - X-Internal-API-Key: <api_key>

    Form body:
      - user_name: display name (from login response data.user.name)

    Returns a new session_id (UUID) + greeting message.
    Mobile app should save this session_id and use it for all subsequent /chat calls.
    """
    user_id = request.state.user_id  # extracted from JWT by middleware
    session_id = str(uuid.uuid4())

    engine = _get_or_create_gemini_engine(
        session_id=session_id,
        user_id=user_id,
        user_name=user_name,
    )
    greet_text = engine.greeting(user_name=user_name)

    return {
        "session_id": session_id,
        "user_id": user_id,
        "reply": greet_text,
        "phase": engine.state.phase if engine.state else "greeting",
        "energy_node": None,
        "turn_count": 0,
    }



# gemini part api
import os as _os
from souli_pipeline.conversation.gemini_engine import GeminiEngine
from souli_pipeline.storage import mongo_store as _mongo
 
# ── Gemini session store (same pattern as existing _sessions dict) ─────────────
# Maps session_id → GeminiEngine instance
# One engine per session — holds in-memory state between turns
_gemini_sessions: Dict[str, GeminiEngine] = {}


def _get_or_create_gemini_engine(
    session_id: str,
    user_id: int = None,
    user_name: str = None,
) -> GeminiEngine:
    """Return existing Gemini engine for session, or create a fresh one."""
    if session_id not in _gemini_sessions:
        engine = GeminiEngine.from_config(_load_config())
        engine.new_session(session_id, user_id=user_id, user_name=user_name)
        _gemini_sessions[session_id] = engine
        logger.info("Gemini session created: %s (user_id=%s)", session_id, user_id)
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
def gemini_greeting(
    request: Request,
    user_name: str = Form(default="buddy"),
):
    user_id = request.state.user_id
    session_id = str(uuid.uuid4())

    engine = _get_or_create_gemini_engine(
        session_id=session_id,
        user_id=user_id,
        user_name=user_name,
    )

    if engine.state and engine.state.turn_count > 0:
        engine.new_session(session_id, user_id=user_id, user_name=user_name)

    greeting_text = engine.greeting(user_name=user_name)
    return {
        "session_id": session_id,
        "user_id": user_id,
        "greeting": greeting_text,
        "engine": "gemini",
        "phase": "greeting",
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
def gemini_session_reset(
    request: Request,
    session_id: str = Form(...),
):
    user_id = request.state.user_id
    user_name = None

    old_engine = _gemini_sessions.get(session_id)
    if old_engine and old_engine.state:
        user_name = old_engine.state.user_name

    new_session_id = str(uuid.uuid4())
    engine = GeminiEngine.from_config(_load_config())
    engine.new_session(new_session_id, user_id=user_id, user_name=user_name)
    _gemini_sessions[new_session_id] = engine

    if session_id in _gemini_sessions:
        del _gemini_sessions[session_id]

    greeting_text = engine.greeting(user_name=user_name)
    return {
        "session_id": new_session_id,
        "greeting": greeting_text,
        "engine": "gemini",
        "status": "reset",
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
