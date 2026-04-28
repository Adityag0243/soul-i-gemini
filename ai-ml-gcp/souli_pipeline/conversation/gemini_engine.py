"""
souli_pipeline/conversation/gemini_engine.py

Gemini-powered Souli conversation engine.

Design notes:
  - System prompt stays byte-stable across turns to keep Gemini's implicit
    context cache warm. Phase awareness is delivered through a small
    "control block" appended as the last user-role message, not by mutating
    the system prompt.
  - History is windowed before each LLM call: first turns (problem anchor)
    + last N turns (recent context). Full transcript still goes to MongoDB.
  - Phase progression is LLM-driven, but Python holds two safety rails:
      (a) summarization is delivered exactly once per session
      (b) energy classification runs exactly once per session
"""
from __future__ import annotations

import logging
import os
import time
import uuid
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from souli_pipeline.llm.gemini import GeminiLLM
from souli_pipeline.conversation.gemini_prompts import (
    PRE_SOLUTION_SYSTEM,
    SOLUTION_SYSTEM,
    build_solution_context,
    build_greeting_context,
)
from souli_pipeline.storage import mongo_store

logger = logging.getLogger(__name__)


PHASE_GREETING      = "greeting"
PHASE_INTAKE        = "intake"
PHASE_DEEPENING     = "deepening"
PHASE_VENTING       = "venting"
PHASE_SHARING       = "sharing"
PHASE_SUMMARIZATION = "summarization"
PHASE_METACOGNITION = "metacognition"
PHASE_COMMITMENT    = "commitment_check"
PHASE_SOLUTION      = "solution"
PHASE_COMPLETE      = "solution_complete"


_DEFAULT_FLASH = os.environ.get("GEMINI_FLASH_MODEL", "gemini-2.5-flash")
_DEFAULT_PRO   = os.environ.get("GEMINI_PRO_MODEL",   "gemini-2.5-pro")

# History window sent to the LLM. Full history is always persisted to Mongo;
# this only controls what we ship in the prompt.
HISTORY_ANCHOR_TURNS = 2     # keep the first N user/assistant pairs
HISTORY_RECENT_TURNS = 12    # keep the last N user/assistant messages
HISTORY_MAX_TOTAL    = 20    # hard cap; if total <= this, no trimming happens


@dataclass
class GeminiState:
    """In-memory state for one conversation session."""

    session_id: str
    user_name: str = "buddy"

    phase:      str = PHASE_GREETING
    turn_count: int = 0
    messages:   List[Dict[str, str]] = field(default_factory=list)

    # Energy classification results (set once at summarization time).
    energy_node:    Optional[str] = None
    secondary_node: Optional[str] = None
    node_reasoning: Optional[str] = None
    summary_text:   str = ""

    # Routing flags returned by the LLM at summarization.
    metacognition_flags: Dict[str, bool] = field(default_factory=dict)
    route_after_summary: Optional[str]   = None

    # Commitment outcome from the commitment_check phase.
    commitment_status: Optional[str] = None

    # Safety rails: each of these guards a one-time-only action.
    summary_delivered:   bool = False
    summary_confirmed:   bool = False
    metacog_delivered:   bool = False
    energy_classified:   bool = False

    # Solution phase tracking.
    solution_active:        bool = False
    solution_step:          int  = 1
    solution_rag_chunks:    List[Dict] = field(default_factory=list)
    solution_steps_history: List[Dict] = field(default_factory=list)
    solution_complete:      bool = False

    # Mongo turn counter is independent of LLM turn count because greeting
    # and assistant-only events also produce mongo records.
    _mongo_turn_id: int = 0


class GeminiEngine:
    """
    Public surface (kept compatible with ConversationEngine):
        new_session(session_id) -> str
        greeting(user_name)     -> str
        turn(user_text, sid)    -> str
        reset(session_id)       -> str
        diagnosis_summary       -> dict
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

        self._flash_llm: Optional[GeminiLLM] = None
        self._pro_llm:   Optional[GeminiLLM] = None
        self.state: Optional[GeminiState] = None

    @classmethod
    def from_config(cls, cfg) -> "GeminiEngine":
        retrieval = getattr(cfg, "retrieval",    None)
        conv      = getattr(cfg, "conversation", None)
        return cls(
            flash_model     = os.environ.get("GEMINI_FLASH_MODEL", _DEFAULT_FLASH),
            pro_model       = os.environ.get("GEMINI_PRO_MODEL",   _DEFAULT_PRO),
            qdrant_host     = getattr(retrieval, "qdrant_host",     "localhost"),
            qdrant_port     = int(getattr(retrieval, "qdrant_port", 6333)),
            embedding_model = getattr(retrieval, "embedding_model",
                                      "sentence-transformers/all-MiniLM-L6-v2"),
            rag_top_k       = int(getattr(conv, "rag_top_k", 4)),
            ollama_endpoint = getattr(conv, "ollama_endpoint", "http://localhost:11434"),
            tagger_model    = getattr(conv, "tagger_model", "qwen2.5:1.5b"),
        )

    # ------------------------------------------------------------------ #
    # LLM lazy loaders. Created once per process, reused across sessions.
    # ------------------------------------------------------------------ #

    def _flash(self) -> GeminiLLM:
        if self._flash_llm is None:
            self._flash_llm = GeminiLLM(
                model=self.flash_model, temperature=0.75, max_output_tokens=4000,
            )
        return self._flash_llm

    def _pro(self) -> GeminiLLM:
        if self._pro_llm is None:
            self._pro_llm = GeminiLLM(
                model=self.pro_model, temperature=0.70, max_output_tokens=8000,
            )
        return self._pro_llm

    # ------------------------------------------------------------------ #
    # Session lifecycle
    # ------------------------------------------------------------------ #

    def new_session(self, session_id: Optional[str] = None) -> str:
        sid = session_id or _generate_session_id()
        self.state = GeminiState(session_id=sid)
        mongo_store.create_session(sid, self.flash_model, self.pro_model)
        logger.info("[GeminiEngine] new session: %s", sid)
        return sid

    def reset(self, session_id: Optional[str] = None) -> str:
        return self.new_session(session_id)

    # ------------------------------------------------------------------ #
    # Greeting
    # ------------------------------------------------------------------ #

    def greeting(self, user_name: str = "buddy") -> str:
        if self.state is None:
            self.new_session()
        self.state.user_name = user_name

        # Greeting context (time of day, occasion) is prepended to the system
        # prompt only on this first turn. This keeps the rest of the session's
        # system prompt byte-stable so implicit prefix caching works.
        greeting_system = (
            build_greeting_context()
            + f"  User's name: {user_name}\n\n"
            + PRE_SOLUTION_SYSTEM
        )

        try:
            result = self._flash().chat_json(
                system=greeting_system,
                messages=[{"role": "user", "content": "start"}],
            )
            text = (result.get("response") or "").strip()
        except Exception as exc:
            logger.warning("[GeminiEngine] greeting failed: %s", exc)
            text = ""

        if not text:
            text = f"Hey {user_name}, I'm Souli. What's been on your mind?"

        self.state.messages.append({"role": "assistant", "content": text})
        self._mongo_append(role="assistant", phase=PHASE_GREETING, content=text)
        return text

    # ------------------------------------------------------------------ #
    # Main turn
    # ------------------------------------------------------------------ #

    def turn(self, user_text: str, session_id: Optional[str] = None) -> str:
        if self.state is None:
            self.new_session(session_id)
        elif session_id and session_id != self.state.session_id:
            self.new_session(session_id)

        s = self.state
        s.turn_count += 1
        user_text = (user_text or "").strip()

        s.messages.append({"role": "user", "content": user_text})
        self._mongo_append(role="user", phase=s.phase, content=user_text)

        t0 = time.time()
        if s.phase == PHASE_SOLUTION or s.solution_active:
            reply, extra = self._handle_solution_step(user_text)
        else:
            reply, extra = self._handle_pre_solution(user_text)
        extra.setdefault("elapsed_ms", int((time.time() - t0) * 1000))

        s.messages.append({"role": "assistant", "content": reply})
        self._mongo_append(role="assistant", phase=s.phase, content=reply, extra=extra)
        return reply

    # ------------------------------------------------------------------ #
    # Pre-solution flow (greeting through commitment_check)
    # ------------------------------------------------------------------ #

    def _handle_pre_solution(self, user_text: str):
        s = self.state

        # The control block tells Gemini what has already happened so it does
        # not re-summarize or re-classify. It is appended as a user-role
        # message tagged [SYSTEM_NOTE] so it is clearly not user content.
        # It is NOT persisted to s.messages or Mongo - only injected at call time.
        windowed = _window_history(s.messages, HISTORY_ANCHOR_TURNS,
                                   HISTORY_RECENT_TURNS, HISTORY_MAX_TOTAL)
        control_block = _build_control_block(s)
        request_messages = _inject_control_block(windowed, control_block)

        try:
            result = self._flash().chat_json(
                system=PRE_SOLUTION_SYSTEM,
                messages=request_messages,
            )
        except Exception as exc:
            logger.error("[GeminiEngine] flash call failed: %s", exc)
            return (
                "I'm here with you. Take your time — what's most present for you right now?",
                {"error": str(exc), "phase": s.phase},
            )

        new_phase         = result.get("phase", s.phase)
        reply             = (result.get("response") or "").strip()
        energy_node       = result.get("energy_node")
        secondary_node    = result.get("secondary_node")
        node_reasoning    = result.get("node_reasoning")
        commitment_result = result.get("commitment_result")
        meta_flags        = result.get("metacognition_flags") or {}
        route_decision    = result.get("route_after_summary")

        if not reply:
            reply = "I'm here with you. Take your time."

        # Safety rail 1: the user has already confirmed a summary, but the LLM
        # is still parked on summarization. Force it forward. This is the
        # backstop; the control block normally prevents this from triggering.
        if (new_phase == PHASE_SUMMARIZATION
                and s.summary_delivered and s.summary_confirmed):
            logger.warning("[GeminiEngine] override: summarization repeated -> commitment_check")
            new_phase = PHASE_METACOGNITION if (
                s.route_after_summary == "metacognition" and not s.metacog_delivered
            ) else PHASE_COMMITMENT
            if reply.strip() == s.summary_text.strip():
                reply = _bridge_response(s.energy_node)

        # State machine transitions
        if new_phase == PHASE_SUMMARIZATION:
            if not s.summary_delivered:
                s.summary_delivered = True
                s.summary_text      = reply
                s.metacognition_flags = {
                    "pattern_participation": bool(meta_flags.get("pattern_participation")),
                    "hidden_benefit":        bool(meta_flags.get("hidden_benefit")),
                    "emotional_stability":   bool(meta_flags.get("emotional_stability")),
                }
                s.route_after_summary = (
                    route_decision
                    if route_decision in ("metacognition", "commitment_check")
                    else "commitment_check"
                )

        if (s.phase == PHASE_SUMMARIZATION
                and s.summary_delivered
                and not s.summary_confirmed
                and new_phase != PHASE_SUMMARIZATION):
            s.summary_confirmed = True

        if new_phase == PHASE_METACOGNITION:
            s.metacog_delivered = True

        # Safety rail 2: classify energy exactly once, when summarization
        # is first delivered. Replaces previous behaviour where the tagger
        # ran on every summarization-marked turn.
        tagger_output = None
        if new_phase == PHASE_SUMMARIZATION and not s.energy_classified:
            s.energy_classified = True
            tagger_output = self._classify_energy()
            if tagger_output:
                energy_node    = tagger_output.get("energy_node") or energy_node
                node_reasoning = node_reasoning or tagger_output.get("reason")
                secondary_node = secondary_node or tagger_output.get("secondary_node")

        s.phase = new_phase

        if energy_node and not s.energy_node:
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

        # Transition into solution phase.
        if new_phase == PHASE_SOLUTION or commitment_result == "seeking_solution":
            s.phase           = PHASE_SOLUTION
            s.solution_active = True
            s.solution_rag_chunks = self._fetch_solution_rag()
            logger.info(
                "[GeminiEngine] solution start - node=%s rag_chunks=%d",
                s.energy_node, len(s.solution_rag_chunks),
            )

        extra = {
            "gemini_phase_decision": new_phase,
            "metacognition_flags":   s.metacognition_flags or None,
            "internal_logic": {
                "tool_call": {
                    "name":      "classify_energy_node",
                    "arguments": {"transcript": s.summary_text[:400]},
                    "output":    tagger_output,
                } if tagger_output else None,
            },
        }
        return reply, extra

    # ------------------------------------------------------------------ #
    # Solution flow (multi-step practice delivery)
    # ------------------------------------------------------------------ #

    def _handle_solution_step(self, user_text: str):
        s = self.state

        if s.solution_steps_history:
            s.solution_steps_history[-1]["user_reply"] = user_text

        context = build_solution_context(
            energy_node     = s.energy_node or "blocked_energy",
            secondary_node  = s.secondary_node,
            node_reasoning  = s.node_reasoning,
            summary_text    = s.summary_text,
            rag_chunks      = s.solution_rag_chunks,
            current_step    = s.solution_step,
            steps_so_far    = s.solution_steps_history,
            user_last_reply = user_text,
        )

        # Pro is more sensitive to JSON formatting under pressure; one retry
        # is enough in practice.
        result = None
        for attempt in range(2):
            try:
                result = self._pro().chat_json(
                    system=SOLUTION_SYSTEM,
                    messages=[{"role": "user", "content": context}],
                )
                break
            except Exception as exc:
                if attempt == 1:
                    logger.error("[GeminiEngine] pro solution step failed: %s", exc)
                    return (
                        "Let's take one gentle breath together. What are you feeling right now?",
                        {"error": str(exc), "phase": PHASE_SOLUTION},
                    )
                logger.warning("[GeminiEngine] pro retry: %s", exc)
                time.sleep(0.5)

        step_id         = result.get("step_id", f"step_{s.solution_step}")
        content         = (result.get("content") or "").strip()
        is_final        = bool(result.get("is_final_step"))
        decision_basis  = result.get("decision_basis", "")
        conclusion_task = result.get("conclusion_task")
        motivation      = result.get("motivation")

        if not content:
            content = "Take a deep breath. What are you noticing right now?"

        if s.solution_steps_history:
            s.solution_steps_history[-1]["decision_taken"] = decision_basis

        step_record = {
            "step_id":         step_id,
            "delivered_at":    _now(),
            "content":         content,
            "user_reply":      None,
            "decision_basis":  decision_basis,
            "decision_taken":  None,
            "conclusion_task": conclusion_task,
            "motivation":      motivation,
        }
        s.solution_steps_history.append(step_record)
        s.solution_step += 1

        if is_final:
            s.solution_complete = True
            s.phase = PHASE_COMPLETE

        extra = {
            "solution_journey": {
                "current_step":  s.solution_step - 1,
                "is_final_step": is_final,
                "step_data":     step_record,
                "rag_sources": (
                    [c.get("source_video", "") for c in s.solution_rag_chunks[:4]]
                    if s.solution_step == 2 else None
                ),
            },
            "internal_logic": {
                "tool_call": {
                    "name":      "query_activities_qdrant",
                    "arguments": {"node": s.energy_node, "query": "grounding and focus"},
                    "output": {
                        "chunks_retrieved": len(s.solution_rag_chunks),
                        "sources": [c.get("source_video", "") for c in s.solution_rag_chunks[:3]],
                    },
                } if s.solution_step == 2 else None,
            },
        }
        return content, extra

    # ------------------------------------------------------------------ #
    # Energy classification (Gemini Flash, runs once per session)
    # ------------------------------------------------------------------ #

    def _classify_energy(self) -> Optional[Dict]:
        valid_nodes = {
            "blocked_energy", "scattered_energy", "depleted_energy",
            "outofcontrol_energy", "normal_energy",
        }
        try:
            user_messages = [
                m["content"] for m in self.state.messages if m["role"] == "user"
            ]
            transcript = " ".join(user_messages[-5:])

            system = (
                "You are an inner-energy wellness analyst for the Souli framework.\n"
                "Read this counseling transcript and classify the user's energy state.\n\n"
                "Nodes:\n"
                "  blocked_energy     - stuck, suppressed, frozen, can't move forward\n"
                "  depleted_energy    - over-giving, exhausted, no reserves\n"
                "  scattered_energy   - high energy without focus, fragmented\n"
                "  outofcontrol_energy- volatile, racing thoughts, unregulated intensity\n"
                "  normal_energy      - balanced, ready to grow\n\n"
                "Return ONLY this JSON:\n"
                "{\n"
                '  "energy_node":    "<node>",\n'
                '  "secondary_node": "<node or null>",\n'
                '  "reason":         "<25-30 words specific to what user shared>"\n'
                "}"
            )
            result = self._flash().chat_json(
                system=system,
                messages=[{"role": "user", "content": f"Transcript:\n{transcript}"}],
                temperature=0.3,
            )
            node = (result.get("energy_node") or "").strip().lower()
            if node not in valid_nodes:
                node = "blocked_energy"
            sec = result.get("secondary_node")
            if sec and str(sec).strip().lower() not in valid_nodes:
                sec = None
            logger.info("[GeminiEngine] energy classified: %s", node)
            return {
                "energy_node":    node,
                "secondary_node": sec,
                "reason":         result.get("reason", ""),
            }
        except Exception as exc:
            logger.warning("[GeminiEngine] energy classifier failed: %s", exc)
            return None

    # ------------------------------------------------------------------ #
    # RAG fetch for solution phase
    # ------------------------------------------------------------------ #

    def _fetch_solution_rag(self) -> List[Dict]:
        try:
            from souli_pipeline.retrieval.qdrant_store_multi import query_by_phase
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
            return chunks
        except Exception as exc:
            logger.warning("[GeminiEngine] qdrant rag failed: %s", exc)
            return []

    # ------------------------------------------------------------------ #
    # Mongo write helper
    # ------------------------------------------------------------------ #

    def _mongo_append(self, role: str, phase: str, content: str,
                      extra: Optional[Dict] = None) -> None:
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

    @property
    def diagnosis_summary(self) -> Dict:
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


# ====================================================================== #
# Module-level helpers
# ====================================================================== #

def _window_history(
    messages: List[Dict[str, str]],
    anchor: int,
    recent: int,
    max_total: int,
) -> List[Dict[str, str]]:
    """
    Trim message history before sending to the LLM.

    Strategy: keep the first `anchor*2` messages (the original problem
    statement + first response are critical context that should never be
    dropped), then keep the last `recent` messages (recent conversation).
    If a gap forms, mark it with a system-style note so the model knows
    content was elided.

    Trimming is skipped entirely when the conversation is short
    (<= max_total messages) so cache prefix matching stays clean.
    """
    if len(messages) <= max_total:
        return list(messages)

    head = messages[: anchor * 2]
    tail = messages[-recent:]

    gap = len(messages) - len(head) - len(tail)
    if gap <= 0:
        return list(messages)

    elision = {
        "role": "user",
        "content": f"[SYSTEM_NOTE: {gap} earlier messages omitted for brevity. "
                   f"Both the opening of the conversation and the most recent "
                   f"messages are preserved.]",
    }
    return head + [elision] + tail


def _build_control_block(s: GeminiState) -> Optional[str]:
    """
    Build the control block injected as a user-role message right before
    the LLM call. Tells the model what state we are in so it does not
    re-do completed phases. Returns None when no control is needed.
    """
    if s.phase in (PHASE_GREETING, PHASE_INTAKE):
        return None

    lines = ["[SYSTEM_NOTE - internal routing context, not visible to user]"]
    lines.append(f"current_phase: {s.phase}")
    lines.append(f"turn_count: {s.turn_count}")

    if s.energy_node:
        lines.append(f"energy_node: {s.energy_node}")
        if s.secondary_node:
            lines.append(f"secondary_node: {s.secondary_node}")

    if s.summary_delivered:
        lines.append("summary_status: already_delivered")
        if s.metacognition_flags:
            lines.append(f"metacognition_flags: {s.metacognition_flags}")
        if s.route_after_summary:
            lines.append(f"intended_next_phase: {s.route_after_summary}")

        if s.summary_confirmed:
            lines.append(
                "user_confirmed_summary: true. "
                "DO NOT repeat the summary. "
                f"Move to '{s.route_after_summary or 'commitment_check'}' "
                "and follow that phase's rules."
            )
        else:
            lines.append(
                "user_confirmed_summary: false_yet. "
                "The user's last message is their response to your summary - "
                "interpret confirmation/correction in their own words and proceed. "
                "Do not repeat the same summary text."
            )

    if s.metacog_delivered:
        lines.append("metacognition_status: already_delivered. "
                     "Move to commitment_check.")

    if s.commitment_status:
        lines.append(f"commitment_result: {s.commitment_status}")

    return "\n".join(lines)


def _inject_control_block(
    messages: List[Dict[str, str]],
    control_block: Optional[str],
) -> List[Dict[str, str]]:
    """
    Insert the control block immediately before the most recent user
    message. We do NOT prepend it to the system prompt - that would
    change the prefix on every turn and defeat implicit context caching.
    """
    if not control_block:
        return messages
    if not messages:
        return [{"role": "user", "content": control_block}]

    out = list(messages)
    insert_at = len(out) - 1 if out[-1]["role"] == "user" else len(out)
    out.insert(insert_at, {"role": "user", "content": control_block})
    return out


def _bridge_response(energy_node: Optional[str]) -> str:
    """
    Fallback bridge text used when the safety rail forces the conversation
    out of a stuck summarization loop. Generic but warm; the LLM will
    take over for the next turn.
    """
    base = (
        "Thank you for sharing that with me. There's something gentle we could "
        "try together that might help with what you're carrying"
    )
    if energy_node == "blocked_energy":
        return base + " - or if there's more sitting with you, I'm right here."
    if energy_node == "depleted_energy":
        return base + " - or we can stay here a little longer if you'd like."
    return base + " - or we can keep talking, whichever feels right."


def _generate_session_id() -> str:
    ts  = datetime.now().strftime("%Y%m%d_%H%M%S")
    uid = uuid.uuid4().hex[:6]
    return f"souli_gemini_{ts}_{uid}"


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()