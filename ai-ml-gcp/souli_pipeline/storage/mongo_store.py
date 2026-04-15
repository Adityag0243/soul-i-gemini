"""
souli_pipeline/storage/mongo_store.py

MongoDB Atlas session storage for the Gemini version of Souli.

- Existing Ollama sessions are NOT affected — this is new, parallel storage.
- No user_id association — sessions are anonymous benchmark data.
- One MongoDB document per session_id.
- Document grows in-place as the conversation progresses.

Collections:
    souli_gemini_sessions  — one document per session, full conversation JSON

Install:
    pip install "pymongo[srv]"

Environment (add to .env):
    MONGODB_ATLAS_URI=mongodb+srv://user:password@cluster.mongodb.net/
    MONGODB_DB_NAME=souli_benchmark     # optional, defaults to souli_benchmark
"""
from __future__ import annotations

import logging
import os
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

logger = logging.getLogger(__name__)

# ── Module-level connection (lazy) ────────────────────────────────────────────
_client     = None
_db         = None
_COLLECTION = "souli_gemini_sessions"


def _get_collection():
    """
    Lazy MongoDB connection — only connects on first call.
    If connection fails, raises RuntimeError with a clear message.
    """
    global _client, _db

    if _client is not None:
        return _db[_COLLECTION]

    uri = os.environ.get("MONGODB_ATLAS_URI", "").strip()
    if not uri:
        raise RuntimeError(
            "MONGODB_ATLAS_URI is not set. "
            "Add it to your .env file: "
            "MONGODB_ATLAS_URI=mongodb+srv://user:pass@cluster.mongodb.net/"
        )

    try:
        from pymongo import MongoClient  # type: ignore
        _client = MongoClient(uri, serverSelectionTimeoutMS=5000)
        _client.admin.command("ping")   # verify connection is alive
        db_name = os.environ.get("MONGODB_DB_NAME", "souli_benchmark")
        _db = _client[db_name]
        logger.info("MongoDB Atlas connected — db: %s, collection: %s", db_name, _COLLECTION)
    except Exception as exc:
        _client = None
        raise RuntimeError(f"MongoDB connection failed: {exc}") from exc

    return _db[_COLLECTION]


def _now() -> str:
    """Return current UTC time as ISO 8601 string."""
    return datetime.now(timezone.utc).isoformat()


# =============================================================================
# Session lifecycle
# =============================================================================

def create_session(
    session_id: str,
    model_flash: str,
    model_pro: str,
) -> bool:
    """
    Create a new session document in MongoDB.
    Called once at the start of every Gemini session.
    If a session with this ID already exists, it is replaced (fresh start).

    Returns True on success, False on failure (logs the error).
    """
    doc = {
        "session_metadata": {
            "session_id":        session_id,
            "user_id":           None,        # intentionally null — benchmark mode
            "start_timestamp":   _now(),
            "energy_node_assigned": None,
            "secondary_node":    None,
            "node_reasoning":    None,
            "commitment_status": None,
            "total_turns":       0,
            "model_version":     f"{model_flash} / {model_pro} (solution)",
        },
        "conversation_history": [],
        "user_feedback":        None,
        "_last_updated":        _now(),
    }
    return _safe_write(
        lambda col: col.replace_one(
            {"session_metadata.session_id": session_id},
            doc,
            upsert=True,
        ),
        op="create_session",
        session_id=session_id,
    )


def append_turn(session_id: str, turn: Dict[str, Any]) -> bool:
    """
    Append one turn (user or assistant) to the conversation_history array.
    Also increments total_turns and updates _last_updated.

    turn dict should follow the schema:
        {
            "turn_id":   int,
            "role":      "user" | "assistant",
            "phase":     str,
            "content":   str,
            "timestamp": ISO str,
            ...any extra fields (internal_logic, solution_journey, etc.)
        }
    """
    return _safe_write(
        lambda col: col.update_one(
            {"session_metadata.session_id": session_id},
            {
                "$push": {"conversation_history": turn},
                "$inc":  {"session_metadata.total_turns": 1},
                "$set":  {"_last_updated": _now()},
            },
        ),
        op="append_turn",
        session_id=session_id,
    )


def update_metadata(session_id: str, updates: Dict[str, Any]) -> bool:
    """
    Update fields inside session_metadata.

    Example:
        update_metadata(sid, {
            "energy_node_assigned": "scattered_energy",
            "secondary_node":       "depleted_energy",
            "node_reasoning":       "User describes spinning and incomplete tasks.",
        })
    """
    set_payload = {f"session_metadata.{k}": v for k, v in updates.items()}
    set_payload["_last_updated"] = _now()

    return _safe_write(
        lambda col: col.update_one(
            {"session_metadata.session_id": session_id},
            {"$set": set_payload},
        ),
        op="update_metadata",
        session_id=session_id,
    )


def update_solution_step_reply(
    session_id: str,
    turn_id: int,
    step_index: int,
    user_reply: str,
    decision_taken: str,
) -> bool:
    """
    Record the user's reply to a solution step and the decision taken.
    Uses MongoDB's positional $ operator to update the nested step.

    turn_id:      The turn_id of the solution assistant turn
    step_index:   0-based index of the step in solution_journey.steps
    user_reply:   What the user said in response to this step
    decision_taken: Which decision was made (from decision_basis)
    """
    field_prefix = f"conversation_history.$[turn].solution_journey.steps.{step_index}"
    return _safe_write(
        lambda col: col.update_one(
            {"session_metadata.session_id": session_id},
            {
                "$set": {
                    f"{field_prefix}.user_reply":     user_reply,
                    f"{field_prefix}.decision_taken": decision_taken,
                    "_last_updated": _now(),
                }
            },
            array_filters=[{"turn.turn_id": turn_id}],
        ),
        op="update_solution_step_reply",
        session_id=session_id,
    )


def save_user_feedback(session_id: str, feedback: Dict[str, Any]) -> bool:
    """
    Save the user's post-session feedback.

    Expected feedback structure (matches the JSON schema you designed):
        {
            "thumb_up": bool,
            "improved_mood": bool,
            "phase_ratings": {
                "Souli-listening-phase":     "good" | "avg" | "bad",
                "Souli-summarization-phase": "good" | "avg" | "bad",
                "Souli-solution-phase":      "it works" | "feels nothing" | "didn't try"
            },
            "user_review": str
        }
    """
    feedback_with_ts = {**feedback, "captured_timestamp": _now()}
    return _safe_write(
        lambda col: col.update_one(
            {"session_metadata.session_id": session_id},
            {"$set": {"user_feedback": feedback_with_ts, "_last_updated": _now()}},
        ),
        op="save_user_feedback",
        session_id=session_id,
    )


# =============================================================================
# Read operations
# =============================================================================

def get_session(session_id: str) -> Optional[Dict]:
    """
    Retrieve the full session document.
    Returns None if not found or on error.
    Used for debugging / Streamlit inspector.
    """
    try:
        col = _get_collection()
        return col.find_one(
            {"session_metadata.session_id": session_id},
            {"_id": 0},   # exclude MongoDB's internal _id field
        )
    except Exception as exc:
        logger.error("MongoDB get_session failed for %s: %s", session_id, exc)
        return None


def list_recent_sessions(limit: int = 20) -> List[Dict]:
    """
    Return the most recent sessions (metadata only, no conversation_history).
    Used for the Streamlit benchmark inspector.
    """
    try:
        col = _get_collection()
        cursor = col.find(
            {},
            {
                "_id": 0,
                "session_metadata": 1,
                "_last_updated": 1,
                "user_feedback": 1,
            },
        ).sort("_last_updated", -1).limit(limit)
        return list(cursor)
    except Exception as exc:
        logger.error("MongoDB list_recent_sessions failed: %s", exc)
        return []


def is_connected() -> bool:
    """Health check — returns True if MongoDB is reachable."""
    try:
        _get_collection()
        return True
    except Exception:
        return False


# =============================================================================
# Internal write helper
# =============================================================================

def _safe_write(op_fn, op: str, session_id: str) -> bool:
    """
    Wraps any write operation in try/except.
    Logs the error and returns False instead of crashing the conversation.
    We never want a MongoDB failure to break Souli's response to the user.
    """
    try:
        col = _get_collection()
        op_fn(col)
        return True
    except Exception as exc:
        logger.error("MongoDB %s failed for session %s: %s", op, session_id, exc)
        return False