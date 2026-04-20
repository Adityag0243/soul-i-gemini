<<<<<<< HEAD
"""
souli_pipeline/conversation/gemini_engine.py

Gemini-powered conversation engine — runs parallel to ConversationEngine.
Nothing in engine.py, counselor.py, ollama.py, or any existing file is changed.

Key differences from the Ollama engine:
  ✅ Phase detection is 100% LLM-driven (Gemini decides phase via JSON response)
  ✅ No keyword matching, no turn-count triggers, no regex in Python
  ✅ Two Gemini models: flash (pre-solution) and pro (solution)
  ✅ Solution phase is multi-turn, step-by-step guided practice
  ✅ All sessions stored to MongoDB Atlas automatically
  ✅ Energy node tagging still uses existing Qwen/Ollama tagger (zero change)
  ✅ RAG uses existing Qdrant query_by_phase() (zero change)

Usage:
    engine = GeminiEngine.from_config(cfg)
    engine.new_session("session-id-here")
    greeting = engine.greeting()
    reply = engine.turn("I feel overwhelmed and can't focus")
"""
from __future__ import annotations

import logging
import os
import uuid
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from souli_pipeline.llm.gemini import GeminiLLM
from souli_pipeline.conversation.gemini_prompts import (
    PRE_SOLUTION_SYSTEM,
    SOLUTION_SYSTEM,
    build_solution_context,
)
from souli_pipeline.storage import mongo_store

logger = logging.getLogger(__name__)

# ── Phase name constants (match existing engine for API compatibility) ─────────
PHASE_GREETING      = "greeting"
PHASE_INTAKE        = "intake"
PHASE_DEEPENING     = "deepening"
PHASE_VENTING       = "venting"
PHASE_SHARING       = "sharing"
PHASE_SUMMARIZATION = "summarization"
PHASE_COMMITMENT    = "commitment_check"
PHASE_SOLUTION      = "solution"
PHASE_COMPLETE      = "solution_complete"

# ── Default model names (override via env vars) ────────────────────────────────
_DEFAULT_FLASH = os.environ.get("GEMINI_FLASH_MODEL", "gemini-2.5-flash-preview-05-20")
_DEFAULT_PRO   = os.environ.get("GEMINI_PRO_MODEL",   "gemini-2.5-pro-preview-05-06")


# =============================================================================
# Conversation State
# =============================================================================

@dataclass
class GeminiState:
    """All in-memory state for one Gemini conversation session."""

    session_id: str

    # ── Core conversation ──────────────────────────────────────────────────────
    phase:       str = PHASE_GREETING
    turn_count:  int = 0
    messages:    List[Dict[str, str]] = field(default_factory=list)  # OpenAI format

    # ── Energy diagnosis ───────────────────────────────────────────────────────
    energy_node:    Optional[str] = None
    secondary_node: Optional[str] = None
    node_reasoning: Optional[str] = None
    summary_text:   str = ""

    # ── Commitment ────────────────────────────────────────────────────────────
    commitment_status: Optional[str] = None   # "seeking_solution" | "wants_more_sharing"

    # ── Solution phase tracking ────────────────────────────────────────────────
    solution_active:       bool = False
    solution_step:         int  = 1         # which step we're currently delivering
    solution_rag_chunks:   List[Dict] = field(default_factory=list)
    solution_steps_history: List[Dict] = field(default_factory=list)
    solution_complete:     bool = False

    # ── MongoDB turn counter (separate from turn_count which counts user turns) ─
    _mongo_turn_id: int = 0


# =============================================================================
# Gemini Engine
# =============================================================================

class GeminiEngine:
    """
    Gemini-powered Souli conversation engine.

    Public interface (matches ConversationEngine where possible):
        engine.new_session(session_id)     → str (session_id)
        engine.greeting()                  → str (opening message)
        engine.turn(user_text)             → str (Souli's reply)
        engine.reset(session_id)           → str (new session_id)
        engine.diagnosis_summary           → dict (phase, energy_node, turn_count, ...)
        engine.state                       → GeminiState
    """

    def __init__(
        self,
        flash_model:     str = _DEFAULT_FLASH,
        pro_model:       str = _DEFAULT_PRO,
        qdrant_host:     str = "localhost",
        qdrant_port:     int = 6333,
        embedding_model: str = "sentence-transformers/all-MiniLM-L6-v2",
        rag_top_k:       int = 4,
        ollama_endpoint: str = "http://localhost:11434",
        tagger_model:    str = "qwen2.5:1.5b",
    ):
        self.flash_model     = flash_model
        self.pro_model       = pro_model
        self.qdrant_host     = qdrant_host
        self.qdrant_port     = qdrant_port
        self.embedding_model = embedding_model
        self.rag_top_k       = rag_top_k
        self.ollama_endpoint = ollama_endpoint
        self.tagger_model    = tagger_model

        # LLM instances — created lazily on first use
        self._flash_llm: Optional[GeminiLLM] = None
        self._pro_llm:   Optional[GeminiLLM] = None

        # Active session state
        self.state: Optional[GeminiState] = None

    # ── Factory ───────────────────────────────────────────────────────────────

    @classmethod
    def from_config(cls, cfg) -> "GeminiEngine":
        """
        Create from existing pipeline config object.
        Reads Qdrant and Ollama settings from the same config used by ConversationEngine.
        """
        retrieval   = getattr(cfg, "retrieval",     None)
        conv        = getattr(cfg, "conversation",  None)

        return cls(
            flash_model     = os.environ.get("GEMINI_FLASH_MODEL", _DEFAULT_FLASH),
            pro_model       = os.environ.get("GEMINI_PRO_MODEL",   _DEFAULT_PRO),
            qdrant_host     = getattr(retrieval, "qdrant_host",     "localhost"),
            qdrant_port     = int(getattr(retrieval, "qdrant_port", 6333)),
            embedding_model = getattr(retrieval, "embedding_model", "sentence-transformers/all-MiniLM-L6-v2"),
            rag_top_k       = int(getattr(conv, "rag_top_k",        4)),
            ollama_endpoint = getattr(conv, "ollama_endpoint",       "http://localhost:11434"),
            tagger_model    = getattr(conv, "tagger_model",          "qwen2.5:1.5b"),
        )

    # ── LLM lazy loaders ──────────────────────────────────────────────────────

    def _flash(self) -> GeminiLLM:
        if self._flash_llm is None:
            self._flash_llm = GeminiLLM(model=self.flash_model, temperature=0.75, max_output_tokens=1200)
        return self._flash_llm

    def _pro(self) -> GeminiLLM:
        if self._pro_llm is None:
            self._pro_llm = GeminiLLM(model=self.pro_model, temperature=0.70, max_output_tokens=1500)
        return self._pro_llm

    # ── Session management ────────────────────────────────────────────────────

    def new_session(self, session_id: Optional[str] = None) -> str:
        """Start a fresh session. Creates MongoDB document. Returns session_id."""
        sid = session_id or _generate_session_id()
        self.state = GeminiState(session_id=sid)
        mongo_store.create_session(sid, self.flash_model, self.pro_model)
        logger.info("[GeminiEngine] New session: %s", sid)
        return sid

    def reset(self, session_id: Optional[str] = None) -> str:
        """Alias for new_session — same interface as ConversationEngine."""
        return self.new_session(session_id)

    # ── Public: Greeting ──────────────────────────────────────────────────────

    def greeting(self) -> str:
        """
        Return the opening greeting.
        Called before any user message (same as ConversationEngine.greeting()).
        """
        if self.state is None:
            self.new_session()

        text = "Hi, I'm Souli. I'm here with you. How's your energy feeling right now?"
        self.state.messages.append({"role": "assistant", "content": text})
        self._mongo_append(role="assistant", phase=PHASE_GREETING, content=text)
        return text

    # ── Public: Turn ──────────────────────────────────────────────────────────

    def turn(self, user_text: str, session_id: Optional[str] = None) -> str:
        """
        Process one user message and return Souli's reply.

        If session_id differs from current session, starts a new session.
        This matches ConversationEngine's session-per-session_id design.
        """
        # Session guard
        if self.state is None:
            self.new_session(session_id)
        elif session_id and session_id != self.state.session_id:
            self.new_session(session_id)

        s = self.state
        s.turn_count += 1
        user_text = (user_text or "").strip()

        # Store user turn
        s.messages.append({"role": "user", "content": user_text})
        self._mongo_append(role="user", phase=s.phase, content=user_text)

        # Route
        if s.phase == PHASE_SOLUTION or s.solution_active:
            reply, extra = self._handle_solution_step(user_text)
        else:
            reply, extra = self._handle_pre_solution(user_text)

        # Store assistant turn
        s.messages.append({"role": "assistant", "content": reply})
        self._mongo_append(
            role="assistant",
            phase=s.phase,
            content=reply,
            extra=extra,
        )

        return reply

    # ── Pre-solution handler ──────────────────────────────────────────────────

    def _handle_pre_solution(self, user_text: str):
        """
        All phases except solution — handled by Gemini Flash.
        Gemini returns JSON with phase + response + metadata.
        """
        s = self.state

        # ── Call Gemini Flash ─────────────────────────────────────────────────
        try:
            result = self._flash().chat_json(
                system=PRE_SOLUTION_SYSTEM,
                messages=s.messages,
            )
        except Exception as exc:
            logger.error("[GeminiEngine] Flash call failed: %s", exc)
            # Graceful fallback — stay in current phase, give neutral response
            return (
                "I'm here with you. Take your time — what's most present for you right now?",
                {"error": str(exc), "phase": s.phase},
            )

        # ── Parse JSON response ───────────────────────────────────────────────
        new_phase        = result.get("phase", s.phase)
        reply            = result.get("response", "")
        energy_node      = result.get("energy_node")
        secondary_node   = result.get("secondary_node")
        node_reasoning   = result.get("node_reasoning")
        commitment_result = result.get("commitment_result")
        should_summarize = result.get("should_trigger_summary", False)

        if not reply:
            reply = "I'm here with you. Take your time."

        # ── At summarization: run Qwen tagger to get the real energy node ─────
        tagger_output = None
        if new_phase == PHASE_SUMMARIZATION or should_summarize:
            s.summary_text = reply  # save summary for solution phase context
            tagger_output  = self._run_energy_tagger()
            if tagger_output:
                # Qwen's result overwrites Gemini's guess — Qwen is specialized
                energy_node    = tagger_output.get("energy_node") or energy_node
                # node_reasoning from Gemini is better worded, keep it unless empty
                node_reasoning = node_reasoning or tagger_output.get("reason")

        # ── Update in-memory state ────────────────────────────────────────────
        s.phase = new_phase

        if energy_node:
            s.energy_node    = energy_node
            s.secondary_node = secondary_node
            s.node_reasoning = node_reasoning
            mongo_store.update_metadata(s.session_id, {
                "energy_node_assigned": energy_node,
                "secondary_node":       secondary_node,
                "node_reasoning":       node_reasoning,
            })

        if commitment_result:
            s.commitment_status = commitment_result
            mongo_store.update_metadata(s.session_id, {
                "commitment_status": commitment_result,
            })

        # ── If user wants solution: transition + pre-fetch RAG ────────────────
        if new_phase == PHASE_SOLUTION or commitment_result == "seeking_solution":
            s.phase          = PHASE_SOLUTION
            s.solution_active = True
            s.solution_rag_chunks = self._fetch_solution_rag()
            logger.info(
                "[GeminiEngine] Transitioning to solution. Energy node: %s. RAG chunks: %d",
                s.energy_node, len(s.solution_rag_chunks),
            )

        # ── Build extra data for MongoDB ──────────────────────────────────────
        extra = {
            "gemini_phase_decision": new_phase,
            "internal_logic": {
                "tool_call": {
                    "name":      "classify_energy_node",
                    "arguments": {"transcript": s.summary_text[:400]},
                    "output":    tagger_output,
                } if tagger_output else None,
            },
        }

        return reply, extra

    # ── Solution step handler ─────────────────────────────────────────────────

    def _handle_solution_step(self, user_text: str):
        """
        Solution phase — handled by Gemini Pro.
        Delivers ONE practice step per call.
        Steps build on each other based on user replies.
        """
        s = self.state

        # Record user reply to the previous step
        if s.solution_steps_history:
            s.solution_steps_history[-1]["user_reply"] = user_text
            # We'll fill decision_taken after this call

        # Build context for Gemini Pro
        context = build_solution_context(
            energy_node    = s.energy_node or "blocked_energy",
            secondary_node = s.secondary_node,
            node_reasoning = s.node_reasoning,
            summary_text   = s.summary_text,
            rag_chunks     = s.solution_rag_chunks,
            current_step   = s.solution_step,
            steps_so_far   = s.solution_steps_history,
            user_last_reply= user_text,
        )

        # ── Call Gemini Pro ───────────────────────────────────────────────────
        try:
            result = self._pro().chat_json(
                system=SOLUTION_SYSTEM,
                messages=[{"role": "user", "content": context}],
            )
        except Exception as exc:
            logger.error("[GeminiEngine] Pro solution step failed: %s", exc)
            return (
                "Let's take a gentle breath together. What are you feeling right now?",
                {"error": str(exc), "phase": PHASE_SOLUTION},
            )

        # ── Parse step result ─────────────────────────────────────────────────
        step_id         = result.get("step_id", f"step_{s.solution_step}")
        content         = result.get("content", "")
        is_final        = result.get("is_final_step", False)
        decision_basis  = result.get("decision_basis", "")
        conclusion_task = result.get("conclusion_task")
        motivation      = result.get("motivation")

        if not content:
            content = "Take a deep breath. What are you noticing right now?"

        # ── Update previous step's decision_taken (if there was one) ─────────
        if s.solution_steps_history:
            s.solution_steps_history[-1]["decision_taken"] = decision_basis

        # ── Record this step ──────────────────────────────────────────────────
        step_record = {
            "step_id":        step_id,
            "delivered_at":   _now(),
            "content":        content,
            "user_reply":     None,           # filled on next turn
            "decision_basis": decision_basis,
            "decision_taken": None,           # filled on next turn
            "conclusion_task": conclusion_task,
            "motivation":     motivation,
        }
        s.solution_steps_history.append(step_record)

        # ── Advance step counter ──────────────────────────────────────────────
        s.solution_step += 1
        if is_final:
            s.solution_complete = True
            s.phase = PHASE_COMPLETE

        # ── Build extra for MongoDB ───────────────────────────────────────────
        extra = {
            "solution_journey": {
                "current_step":  s.solution_step - 1,
                "is_final_step": is_final,
                "step_data":     step_record,
                # RAG sources logged only on first solution step
                "rag_sources": (
                    [c.get("source_video", "") for c in s.solution_rag_chunks[:4]]
                    if s.solution_step == 2 else None
                ),
            },
            "internal_logic": {
                "tool_call": {
                    "name": "query_activities_qdrant",
                    "arguments": {
                        "node":  s.energy_node,
                        "query": "grounding and focus practices",
                    },
                    "output": {
                        "chunks_retrieved": len(s.solution_rag_chunks),
                        "sources": [c.get("source_video", "") for c in s.solution_rag_chunks[:3]],
                    },
                } if s.solution_step == 2 else None,
            },
        }

        return content, extra

    # ── Energy tagger (existing Qwen — zero change to energy_tagger.py) ───────

    def _run_energy_tagger(self) -> Optional[Dict]:
        """
        Calls the existing Qwen energy tagger with the user messages so far.
        Qwen runs via Ollama — if Ollama is down, returns None and we fall back
        to Gemini's own energy_node guess from the JSON response.

        This is the ONLY point where Ollama is used in the Gemini engine.
        If you don't have Ollama running, the engine still works — Gemini's
        energy_node guess is used instead. It's less accurate but not broken.
        """
        try:
            from souli_pipeline.youtube.energy_tagger import tag_chunk  # existing, untouched

            # Use the last 5 user messages as tagging input
            user_messages = [
                m["content"] for m in self.state.messages
                if m["role"] == "user"
            ]
            transcript = " ".join(user_messages[-5:])

            result = tag_chunk(
                text             = transcript,
                ollama_model     = self.tagger_model,
                ollama_endpoint  = self.ollama_endpoint,
                timeout_s        = 30,
            )
            logger.info("[GeminiEngine] Energy tagger result: %s", result)
            return result

        except Exception as exc:
            logger.warning(
                "[GeminiEngine] Energy tagger failed (Ollama down?): %s — "
                "Gemini's energy_node estimate will be used instead.",
                exc,
            )
            return None

    # ── RAG retrieval (existing Qdrant — zero change to qdrant_store_multi.py) ─

    def _fetch_solution_rag(self) -> List[Dict]:
        """
        Fetch activity chunks from Qdrant for the solution phase.
        Uses the existing query_by_phase() function — zero change to that code.
        """
        try:
            from souli_pipeline.retrieval.qdrant_store_multi import query_by_phase  # existing

            chunks = query_by_phase(
                user_text       = self.state.summary_text or "",
                phase           = "solution",
                energy_node     = self.state.energy_node or "",
                turn_count      = self.state.turn_count,
                top_k           = self.rag_top_k,
                embedding_model = self.embedding_model,
                host            = self.qdrant_host,
                port            = self.qdrant_port,
            )
            logger.info(
                "[GeminiEngine] Solution RAG: %d chunks for node '%s'",
                len(chunks), self.state.energy_node,
            )
            return chunks

        except Exception as exc:
            logger.warning("[GeminiEngine] Qdrant RAG failed: %s — solution will run without RAG.", exc)
            return []

    # ── MongoDB helpers ───────────────────────────────────────────────────────

    def _mongo_append(
        self,
        role:    str,
        phase:   str,
        content: str,
        extra:   Optional[Dict] = None,
    ) -> None:
        """Build and append a turn document to MongoDB."""
        s = self.state
        s._mongo_turn_id += 1

        turn: Dict[str, Any] = {
            "turn_id":   s._mongo_turn_id,
            "role":      role,
            "phase":     phase,
            "content":   content,
            "timestamp": _now(),
        }
        if extra:
            turn.update(extra)

        mongo_store.append_turn(s.session_id, turn)

    # ── API compatibility property ─────────────────────────────────────────────

    @property
    def diagnosis_summary(self) -> Dict:
        """
        Returns state in the same format as ConversationEngine.diagnosis_summary.
        This makes the Gemini engine a drop-in for existing API response building.
        """
        if self.state is None:
            return {}
        return {
            "phase":          self.state.phase,
            "energy_node":    self.state.energy_node,
            "secondary_node": self.state.secondary_node,
            "node_reasoning": self.state.node_reasoning,
            "confidence":     "gemini_classified",
            "turn_count":     self.state.turn_count,
            "intent":         self.state.commitment_status,
            "session_id":     self.state.session_id,
        }


# =============================================================================
# Utilities
# =============================================================================

def _generate_session_id() -> str:
    ts  = datetime.now().strftime("%Y%m%d_%H%M%S")
    uid = uuid.uuid4().hex[:6]
    return f"souli_gemini_{ts}_{uid}"


def _now() -> str:
=======
"""
souli_pipeline/conversation/gemini_engine.py

Gemini-powered conversation engine — runs parallel to ConversationEngine.
Nothing in engine.py, counselor.py, ollama.py, or any existing file is changed.

Key differences from the Ollama engine:
  ✅ Phase detection is 100% LLM-driven (Gemini decides phase via JSON response)
  ✅ No keyword matching, no turn-count triggers, no regex in Python
  ✅ Two Gemini models: flash (pre-solution) and pro (solution)
  ✅ Solution phase is multi-turn, step-by-step guided practice
  ✅ All sessions stored to MongoDB Atlas automatically
  ✅ Energy node tagging still uses existing Qwen/Ollama tagger (zero change)
  ✅ RAG uses existing Qdrant query_by_phase() (zero change)

Usage:
    engine = GeminiEngine.from_config(cfg)
    engine.new_session("session-id-here")
    greeting = engine.greeting()
    reply = engine.turn("I feel overwhelmed and can't focus")
"""
from __future__ import annotations

import logging
import os
import uuid
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from souli_pipeline.llm.gemini import GeminiLLM
from souli_pipeline.conversation.gemini_prompts import (
    PRE_SOLUTION_SYSTEM,
    SOLUTION_SYSTEM,
    build_solution_context,
)
from souli_pipeline.storage import mongo_store

logger = logging.getLogger(__name__)

# ── Phase name constants (match existing engine for API compatibility) ─────────
PHASE_GREETING      = "greeting"
PHASE_INTAKE        = "intake"
PHASE_DEEPENING     = "deepening"
PHASE_VENTING       = "venting"
PHASE_SHARING       = "sharing"
PHASE_SUMMARIZATION = "summarization"
PHASE_COMMITMENT    = "commitment_check"
PHASE_SOLUTION      = "solution"
PHASE_COMPLETE      = "solution_complete"

# ── Default model names (override via env vars) ────────────────────────────────
_DEFAULT_FLASH = os.environ.get("GEMINI_FLASH_MODEL", "gemini-2.5-flash-preview-05-20")
_DEFAULT_PRO   = os.environ.get("GEMINI_PRO_MODEL",   "gemini-2.5-pro-preview-05-06")


# =============================================================================
# Conversation State
# =============================================================================

@dataclass
class GeminiState:
    """All in-memory state for one Gemini conversation session."""

    session_id: str

    # ── Core conversation ──────────────────────────────────────────────────────
    phase:       str = PHASE_GREETING
    turn_count:  int = 0
    messages:    List[Dict[str, str]] = field(default_factory=list)  # OpenAI format

    # ── Energy diagnosis ───────────────────────────────────────────────────────
    energy_node:    Optional[str] = None
    secondary_node: Optional[str] = None
    node_reasoning: Optional[str] = None
    summary_text:   str = ""

    # ── Commitment ────────────────────────────────────────────────────────────
    commitment_status: Optional[str] = None   # "seeking_solution" | "wants_more_sharing"

    # ── Solution phase tracking ────────────────────────────────────────────────
    solution_active:       bool = False
    solution_step:         int  = 1         # which step we're currently delivering
    solution_rag_chunks:   List[Dict] = field(default_factory=list)
    solution_steps_history: List[Dict] = field(default_factory=list)
    solution_complete:     bool = False

    # ── MongoDB turn counter (separate from turn_count which counts user turns) ─
    _mongo_turn_id: int = 0


# =============================================================================
# Gemini Engine
# =============================================================================

class GeminiEngine:
    """
    Gemini-powered Souli conversation engine.

    Public interface (matches ConversationEngine where possible):
        engine.new_session(session_id)     → str (session_id)
        engine.greeting()                  → str (opening message)
        engine.turn(user_text)             → str (Souli's reply)
        engine.reset(session_id)           → str (new session_id)
        engine.diagnosis_summary           → dict (phase, energy_node, turn_count, ...)
        engine.state                       → GeminiState
    """

    def __init__(
        self,
        flash_model:     str = _DEFAULT_FLASH,
        pro_model:       str = _DEFAULT_PRO,
        qdrant_host:     str = "localhost",
        qdrant_port:     int = 6333,
        embedding_model: str = "sentence-transformers/all-MiniLM-L6-v2",
        rag_top_k:       int = 4,
        ollama_endpoint: str = "http://localhost:11434",
        tagger_model:    str = "qwen2.5:1.5b",
    ):
        self.flash_model     = flash_model
        self.pro_model       = pro_model
        self.qdrant_host     = qdrant_host
        self.qdrant_port     = qdrant_port
        self.embedding_model = embedding_model
        self.rag_top_k       = rag_top_k
        self.ollama_endpoint = ollama_endpoint
        self.tagger_model    = tagger_model

        # LLM instances — created lazily on first use
        self._flash_llm: Optional[GeminiLLM] = None
        self._pro_llm:   Optional[GeminiLLM] = None

        # Active session state
        self.state: Optional[GeminiState] = None

    # ── Factory ───────────────────────────────────────────────────────────────

    @classmethod
    def from_config(cls, cfg) -> "GeminiEngine":
        """
        Create from existing pipeline config object.
        Reads Qdrant and Ollama settings from the same config used by ConversationEngine.
        """
        retrieval   = getattr(cfg, "retrieval",     None)
        conv        = getattr(cfg, "conversation",  None)

        return cls(
            flash_model     = os.environ.get("GEMINI_FLASH_MODEL", _DEFAULT_FLASH),
            pro_model       = os.environ.get("GEMINI_PRO_MODEL",   _DEFAULT_PRO),
            qdrant_host     = getattr(retrieval, "qdrant_host",     "localhost"),
            qdrant_port     = int(getattr(retrieval, "qdrant_port", 6333)),
            embedding_model = getattr(retrieval, "embedding_model", "sentence-transformers/all-MiniLM-L6-v2"),
            rag_top_k       = int(getattr(conv, "rag_top_k",        4)),
            ollama_endpoint = getattr(conv, "ollama_endpoint",       "http://localhost:11434"),
            tagger_model    = getattr(conv, "tagger_model",          "qwen2.5:1.5b"),
        )

    # ── LLM lazy loaders ──────────────────────────────────────────────────────

    def _flash(self) -> GeminiLLM:
        if self._flash_llm is None:
            self._flash_llm = GeminiLLM(model=self.flash_model, temperature=0.75, max_output_tokens=1200)
        return self._flash_llm

    def _pro(self) -> GeminiLLM:
        if self._pro_llm is None:
            self._pro_llm = GeminiLLM(model=self.pro_model, temperature=0.70, max_output_tokens=1500)
        return self._pro_llm

    # ── Session management ────────────────────────────────────────────────────

    def new_session(self, session_id: Optional[str] = None) -> str:
        """Start a fresh session. Creates MongoDB document. Returns session_id."""
        sid = session_id or _generate_session_id()
        self.state = GeminiState(session_id=sid)
        mongo_store.create_session(sid, self.flash_model, self.pro_model)
        logger.info("[GeminiEngine] New session: %s", sid)
        return sid

    def reset(self, session_id: Optional[str] = None) -> str:
        """Alias for new_session — same interface as ConversationEngine."""
        return self.new_session(session_id)

    # ── Public: Greeting ──────────────────────────────────────────────────────

    def greeting(self) -> str:
        """
        Return the opening greeting.
        Called before any user message (same as ConversationEngine.greeting()).
        """
        if self.state is None:
            self.new_session()

        text = "Hi, I'm Souli. I'm here with you. How's your energy feeling right now?"
        self.state.messages.append({"role": "assistant", "content": text})
        self._mongo_append(role="assistant", phase=PHASE_GREETING, content=text)
        return text

    # ── Public: Turn ──────────────────────────────────────────────────────────

    def turn(self, user_text: str, session_id: Optional[str] = None) -> str:
        """
        Process one user message and return Souli's reply.

        If session_id differs from current session, starts a new session.
        This matches ConversationEngine's session-per-session_id design.
        """
        # Session guard
        if self.state is None:
            self.new_session(session_id)
        elif session_id and session_id != self.state.session_id:
            self.new_session(session_id)

        s = self.state
        s.turn_count += 1
        user_text = (user_text or "").strip()

        # Store user turn
        s.messages.append({"role": "user", "content": user_text})
        self._mongo_append(role="user", phase=s.phase, content=user_text)

        # Route
        if s.phase == PHASE_SOLUTION or s.solution_active:
            reply, extra = self._handle_solution_step(user_text)
        else:
            reply, extra = self._handle_pre_solution(user_text)

        # Store assistant turn
        s.messages.append({"role": "assistant", "content": reply})
        self._mongo_append(
            role="assistant",
            phase=s.phase,
            content=reply,
            extra=extra,
        )

        return reply

    # ── Pre-solution handler ──────────────────────────────────────────────────

    def _handle_pre_solution(self, user_text: str):
        """
        All phases except solution — handled by Gemini Flash.
        Gemini returns JSON with phase + response + metadata.
        """
        s = self.state

        # ── Call Gemini Flash ─────────────────────────────────────────────────
        try:
            result = self._flash().chat_json(
                system=PRE_SOLUTION_SYSTEM,
                messages=s.messages,
            )
        except Exception as exc:
            logger.error("[GeminiEngine] Flash call failed: %s", exc)
            # Graceful fallback — stay in current phase, give neutral response
            return (
                "I'm here with you. Take your time — what's most present for you right now?",
                {"error": str(exc), "phase": s.phase},
            )

        # ── Parse JSON response ───────────────────────────────────────────────
        new_phase        = result.get("phase", s.phase)
        reply            = result.get("response", "")
        energy_node      = result.get("energy_node")
        secondary_node   = result.get("secondary_node")
        node_reasoning   = result.get("node_reasoning")
        commitment_result = result.get("commitment_result")
        should_summarize = result.get("should_trigger_summary", False)

        if not reply:
            reply = "I'm here with you. Take your time."

        # ── At summarization: run Qwen tagger to get the real energy node ─────
        tagger_output = None
        if new_phase == PHASE_SUMMARIZATION or should_summarize:
            s.summary_text = reply  # save summary for solution phase context
            tagger_output  = self._run_energy_tagger()
            if tagger_output:
                # Qwen's result overwrites Gemini's guess — Qwen is specialized
                energy_node    = tagger_output.get("energy_node") or energy_node
                # node_reasoning from Gemini is better worded, keep it unless empty
                node_reasoning = node_reasoning or tagger_output.get("reason")

        # ── Update in-memory state ────────────────────────────────────────────
        s.phase = new_phase

        if energy_node:
            s.energy_node    = energy_node
            s.secondary_node = secondary_node
            s.node_reasoning = node_reasoning
            mongo_store.update_metadata(s.session_id, {
                "energy_node_assigned": energy_node,
                "secondary_node":       secondary_node,
                "node_reasoning":       node_reasoning,
            })

        if commitment_result:
            s.commitment_status = commitment_result
            mongo_store.update_metadata(s.session_id, {
                "commitment_status": commitment_result,
            })

        # ── If user wants solution: transition + pre-fetch RAG ────────────────
        if new_phase == PHASE_SOLUTION or commitment_result == "seeking_solution":
            s.phase          = PHASE_SOLUTION
            s.solution_active = True
            s.solution_rag_chunks = self._fetch_solution_rag()
            logger.info(
                "[GeminiEngine] Transitioning to solution. Energy node: %s. RAG chunks: %d",
                s.energy_node, len(s.solution_rag_chunks),
            )

        # ── Build extra data for MongoDB ──────────────────────────────────────
        extra = {
            "gemini_phase_decision": new_phase,
            "internal_logic": {
                "tool_call": {
                    "name":      "classify_energy_node",
                    "arguments": {"transcript": s.summary_text[:400]},
                    "output":    tagger_output,
                } if tagger_output else None,
            },
        }

        return reply, extra

    # ── Solution step handler ─────────────────────────────────────────────────

    def _handle_solution_step(self, user_text: str):
        """
        Solution phase — handled by Gemini Pro.
        Delivers ONE practice step per call.
        Steps build on each other based on user replies.
        """
        s = self.state

        # Record user reply to the previous step
        if s.solution_steps_history:
            s.solution_steps_history[-1]["user_reply"] = user_text
            # We'll fill decision_taken after this call

        # Build context for Gemini Pro
        context = build_solution_context(
            energy_node    = s.energy_node or "blocked_energy",
            secondary_node = s.secondary_node,
            node_reasoning = s.node_reasoning,
            summary_text   = s.summary_text,
            rag_chunks     = s.solution_rag_chunks,
            current_step   = s.solution_step,
            steps_so_far   = s.solution_steps_history,
            user_last_reply= user_text,
        )

        # ── Call Gemini Pro ───────────────────────────────────────────────────
        try:
            result = self._pro().chat_json(
                system=SOLUTION_SYSTEM,
                messages=[{"role": "user", "content": context}],
            )
        except Exception as exc:
            logger.error("[GeminiEngine] Pro solution step failed: %s", exc)
            return (
                "Let's take a gentle breath together. What are you feeling right now?",
                {"error": str(exc), "phase": PHASE_SOLUTION},
            )

        # ── Parse step result ─────────────────────────────────────────────────
        step_id         = result.get("step_id", f"step_{s.solution_step}")
        content         = result.get("content", "")
        is_final        = result.get("is_final_step", False)
        decision_basis  = result.get("decision_basis", "")
        conclusion_task = result.get("conclusion_task")
        motivation      = result.get("motivation")

        if not content:
            content = "Take a deep breath. What are you noticing right now?"

        # ── Update previous step's decision_taken (if there was one) ─────────
        if s.solution_steps_history:
            s.solution_steps_history[-1]["decision_taken"] = decision_basis

        # ── Record this step ──────────────────────────────────────────────────
        step_record = {
            "step_id":        step_id,
            "delivered_at":   _now(),
            "content":        content,
            "user_reply":     None,           # filled on next turn
            "decision_basis": decision_basis,
            "decision_taken": None,           # filled on next turn
            "conclusion_task": conclusion_task,
            "motivation":     motivation,
        }
        s.solution_steps_history.append(step_record)

        # ── Advance step counter ──────────────────────────────────────────────
        s.solution_step += 1
        if is_final:
            s.solution_complete = True
            s.phase = PHASE_COMPLETE

        # ── Build extra for MongoDB ───────────────────────────────────────────
        extra = {
            "solution_journey": {
                "current_step":  s.solution_step - 1,
                "is_final_step": is_final,
                "step_data":     step_record,
                # RAG sources logged only on first solution step
                "rag_sources": (
                    [c.get("source_video", "") for c in s.solution_rag_chunks[:4]]
                    if s.solution_step == 2 else None
                ),
            },
            "internal_logic": {
                "tool_call": {
                    "name": "query_activities_qdrant",
                    "arguments": {
                        "node":  s.energy_node,
                        "query": "grounding and focus practices",
                    },
                    "output": {
                        "chunks_retrieved": len(s.solution_rag_chunks),
                        "sources": [c.get("source_video", "") for c in s.solution_rag_chunks[:3]],
                    },
                } if s.solution_step == 2 else None,
            },
        }

        return content, extra

    # ── Energy tagger (existing Qwen — zero change to energy_tagger.py) ───────

    def _run_energy_tagger(self) -> Optional[Dict]:
        """
        Calls the existing Qwen energy tagger with the user messages so far.
        Qwen runs via Ollama — if Ollama is down, returns None and we fall back
        to Gemini's own energy_node guess from the JSON response.

        This is the ONLY point where Ollama is used in the Gemini engine.
        If you don't have Ollama running, the engine still works — Gemini's
        energy_node guess is used instead. It's less accurate but not broken.
        """
        try:
            from souli_pipeline.youtube.energy_tagger import tag_chunk  # existing, untouched

            # Use the last 5 user messages as tagging input
            user_messages = [
                m["content"] for m in self.state.messages
                if m["role"] == "user"
            ]
            transcript = " ".join(user_messages[-5:])

            result = tag_chunk(
                text             = transcript,
                ollama_model     = self.tagger_model,
                ollama_endpoint  = self.ollama_endpoint,
                timeout_s        = 30,
            )
            logger.info("[GeminiEngine] Energy tagger result: %s", result)
            return result

        except Exception as exc:
            logger.warning(
                "[GeminiEngine] Energy tagger failed (Ollama down?): %s — "
                "Gemini's energy_node estimate will be used instead.",
                exc,
            )
            return None

    # ── RAG retrieval (existing Qdrant — zero change to qdrant_store_multi.py) ─

    def _fetch_solution_rag(self) -> List[Dict]:
        """
        Fetch activity chunks from Qdrant for the solution phase.
        Uses the existing query_by_phase() function — zero change to that code.
        """
        try:
            from souli_pipeline.retrieval.qdrant_store_multi import query_by_phase  # existing

            chunks = query_by_phase(
                user_text       = self.state.summary_text or "",
                phase           = "solution",
                energy_node     = self.state.energy_node or "",
                turn_count      = self.state.turn_count,
                top_k           = self.rag_top_k,
                embedding_model = self.embedding_model,
                host            = self.qdrant_host,
                port            = self.qdrant_port,
            )
            logger.info(
                "[GeminiEngine] Solution RAG: %d chunks for node '%s'",
                len(chunks), self.state.energy_node,
            )
            return chunks

        except Exception as exc:
            logger.warning("[GeminiEngine] Qdrant RAG failed: %s — solution will run without RAG.", exc)
            return []

    # ── MongoDB helpers ───────────────────────────────────────────────────────

    def _mongo_append(
        self,
        role:    str,
        phase:   str,
        content: str,
        extra:   Optional[Dict] = None,
    ) -> None:
        """Build and append a turn document to MongoDB."""
        s = self.state
        s._mongo_turn_id += 1

        turn: Dict[str, Any] = {
            "turn_id":   s._mongo_turn_id,
            "role":      role,
            "phase":     phase,
            "content":   content,
            "timestamp": _now(),
        }
        if extra:
            turn.update(extra)

        mongo_store.append_turn(s.session_id, turn)

    # ── API compatibility property ─────────────────────────────────────────────

    @property
    def diagnosis_summary(self) -> Dict:
        """
        Returns state in the same format as ConversationEngine.diagnosis_summary.
        This makes the Gemini engine a drop-in for existing API response building.
        """
        if self.state is None:
            return {}
        return {
            "phase":          self.state.phase,
            "energy_node":    self.state.energy_node,
            "secondary_node": self.state.secondary_node,
            "node_reasoning": self.state.node_reasoning,
            "confidence":     "gemini_classified",
            "turn_count":     self.state.turn_count,
            "intent":         self.state.commitment_status,
            "session_id":     self.state.session_id,
        }


# =============================================================================
# Utilities
# =============================================================================

def _generate_session_id() -> str:
    ts  = datetime.now().strftime("%Y%m%d_%H%M%S")
    uid = uuid.uuid4().hex[:6]
    return f"souli_gemini_{ts}_{uid}"


def _now() -> str:
>>>>>>> 8a1cf2387017bb70210464c72dc7d4c14c378a47
    return datetime.now(timezone.utc).isoformat()