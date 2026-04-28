"""
souli_pipeline/conversation/solution_engine.py

Solution + prescription state machine. Owns the entire flow from the
moment the user agrees to try a practice, through delivery and reflection,
into a closing 7-day prescription handoff.

Substep flow:
  awaiting_chanting_answer  user just agreed to try; we asked the chanting
                            comfort question. Their next message answers it.
  awaiting_setup            we picked a practice and asked them to find a
                            quiet spot. Their next message confirms readiness.
  awaiting_done             steps were delivered in one message; we wait
                            for "done" or any clarifying question.
  awaiting_reflection       practice complete; we asked how they feel now.
                            Their next message is their reflection.
  prescription              final message: 5-line simple plan + 7-day
                            handoff. Sets prescription_delivered=True.
  complete                  terminal. Engine should not route here again.

Entry point:
  handle_solution_turn(state, user_text, llm_pro, llm_flash, fetch_rag_fn)
"""
from __future__ import annotations

import logging
from typing import TYPE_CHECKING, Callable, Dict, List, Optional, Tuple

if TYPE_CHECKING:
    from souli_pipeline.conversation.gemini_engine import GeminiState
    from souli_pipeline.llm.gemini import GeminiLLM

logger = logging.getLogger(__name__)


SUB_AWAITING_CHANTING   = "awaiting_chanting_answer"
SUB_AWAITING_SETUP      = "awaiting_setup"
SUB_AWAITING_DONE       = "awaiting_done"
SUB_AWAITING_REFLECTION = "awaiting_reflection"
SUB_PRESCRIPTION        = "prescription"
SUB_COMPLETE            = "complete"

PHASE_SOLUTION     = "solution"
PHASE_PRESCRIPTION = "prescription"
PHASE_COMPLETE     = "solution_complete"


# ====================================================================== #
# Public entry point
# ====================================================================== #

def handle_solution_turn(
    state:        "GeminiState",
    user_text:    str,
    llm_pro:      "GeminiLLM",
    llm_flash:    "GeminiLLM",
    fetch_rag_fn: Callable[[], List[Dict]],
) -> Tuple[str, Dict]:
    """
    Route a turn to the right substep handler based on state.solution_substep.
    Returns (reply_text, mongo_extra_dict).
    """
    sub = getattr(state, "solution_substep", SUB_AWAITING_CHANTING)

    if sub == SUB_AWAITING_CHANTING:
        return _handle_chanting_answer(state, user_text, llm_flash, fetch_rag_fn)
    if sub == SUB_AWAITING_SETUP:
        return _handle_setup_confirm(state, user_text, llm_pro)
    if sub == SUB_AWAITING_DONE:
        return _handle_practice_done(state, user_text, llm_flash)
    if sub == SUB_AWAITING_REFLECTION:
        return _handle_reflection(state, user_text, llm_flash)
    if sub == SUB_PRESCRIPTION:
        return _emit_prescription(state, user_text, llm_flash)

    return (
        "Take care of yourself today. I'm here whenever you want to talk again.",
        {"solution_substep": SUB_COMPLETE, "terminal": True},
    )


# ====================================================================== #
# Substep 1: chanting comfort answer -> pick practice -> setup ask
# ====================================================================== #

def _handle_chanting_answer(
    state:        "GeminiState",
    user_text:    str,
    llm:          "GeminiLLM",
    fetch_rag_fn: Callable[[], List[Dict]],
) -> Tuple[str, Dict]:
    """
    Interpret the user's answer to the chanting question, fetch RAG,
    filter by chanting preference, pick a practice, and ask the user to
    settle in.
    """
    chanting_ok = _interpret_chanting_answer(user_text, llm)
    state.chanting_ok = chanting_ok

    chunks = fetch_rag_fn() or []
    if not chanting_ok:
        chunks = _filter_out_chanting(chunks)
    state.solution_rag_chunks = chunks

    practice = _pick_practice(chunks)
    state.practice_chosen = practice

    reply = _build_setup_message(practice, llm)
    state.solution_substep = SUB_AWAITING_SETUP

    extra = {
        "solution_substep": SUB_AWAITING_SETUP,
        "chanting_ok":      chanting_ok,
        "practice_chosen":  practice.get("name") if practice else None,
        "practice_source":  practice.get("source_video") if practice else None,
    }
    return reply, extra


def _interpret_chanting_answer(user_text: str, llm: "GeminiLLM") -> bool:
    """
    Use Flash to read the user's natural-language answer to the chanting
    question. Default to False (no chanting) on any ambiguity, since
    it is the safer assumption.
    """
    text = (user_text or "").strip()
    if not text:
        return False

    system = (
        "You read one short user message answering: 'Are you comfortable with "
        "practices that include chanting like OM or a mantra?' Return ONLY this "
        "JSON: {\"chanting_ok\": true|false}. "
        "true = user is fine with chanting (yes, sure, ok, no problem, fine, "
        "go ahead). "
        "false = user prefers no chanting, is unsure, or did not answer the "
        "question (no, please no, without chanting, prefer not to, idk, skip)."
    )
    try:
        result = llm.chat_json(
            system=system,
            messages=[{"role": "user", "content": text}],
            temperature=0.0,
        )
        return bool(result.get("chanting_ok", False))
    except Exception as exc:
        logger.warning("[solution_engine] chanting interpret failed: %s", exc)
        return False


def _filter_out_chanting(chunks: List[Dict]) -> List[Dict]:
    """
    Drop RAG chunks that mention chanting, OM, or mantra. Keyword-based
    v1 filter; can be replaced with a proper has_chanting flag at
    ingestion time later.
    """
    blocked = ("chanting", "chant", "mantra", " om ", " om.", " om,", "om-")
    out = []
    for c in chunks:
        haystack = " " + (c.get("text") or "").lower() + " "
        title    = " " + (c.get("title") or "").lower() + " "
        if any(b in haystack or b in title for b in blocked):
            continue
        out.append(c)
    return out


def _pick_practice(chunks: List[Dict]) -> Optional[Dict]:
    """
    Pick the highest-scoring activity-type chunk. Falls back to the first
    chunk of any type, then to None. Returned dict carries name + duration
    + steps so downstream code can use them without re-parsing.
    """
    if not chunks:
        return None

    activities = [
        c for c in chunks
        if (c.get("chunk_type") or "").lower() in ("activity", "activities", "practice")
    ]
    candidate = activities[0] if activities else chunks[0]

    return {
        "name":         _practice_name(candidate),
        "duration_min": _practice_duration(candidate),
        "source_video": candidate.get("source_video", ""),
        "text":         candidate.get("text", ""),
        "raw":          candidate,
    }


def _practice_name(chunk: Dict) -> str:
    """Pick a short readable name for the practice."""
    for key in ("title", "practice_name", "name"):
        v = chunk.get(key)
        if v:
            return str(v).strip()
    text = (chunk.get("text") or "").strip()
    first_line = text.split("\n", 1)[0].strip()
    return first_line[:60] if first_line else "this practice"


def _practice_duration(chunk: Dict) -> int:
    """Return suggested duration in minutes; default 10."""
    for key in ("duration_min", "duration", "minutes"):
        v = chunk.get(key)
        if v:
            try:
                return int(v)
            except (ValueError, TypeError):
                pass
    return 10


def _build_setup_message(practice: Optional[Dict], llm: "GeminiLLM") -> str:
    """
    Generate the setup ask: name the practice, give duration, ask them
    to find a quiet uninterrupted spot. Templated with one LLM softening
    pass for warmth.
    """
    if not practice:
        return (
            "Let's start with a simple grounding practice that takes about "
            "10 minutes. Find a quiet spot where you won't be interrupted, "
            "and sit comfortably. Let me know when you're settled."
        )

    name     = practice["name"]
    duration = practice["duration_min"]

    base = (
        f"Good. We'll do {name}, which takes about {duration} minutes. "
        f"Find a quiet spot where no one will interrupt you, and settle into "
        f"a comfortable position — sitting upright is best, but lying down is "
        f"fine too. Let me know when you're ready and I'll walk you through it."
    )
    return base


# ====================================================================== #
# Substep 2: setup confirmed -> deliver all steps in one message
# ====================================================================== #

def _handle_setup_confirm(
    state:     "GeminiState",
    user_text: str,
    llm:       "GeminiLLM",
) -> Tuple[str, Dict]:
    """
    User has settled in. Generate the full step list as one numbered
    message and move to awaiting_done.
    """
    state.setup_confirmed = True

    practice = state.practice_chosen
    delivery = _build_delivery_message(practice, llm)

    state.solution_substep = SUB_AWAITING_DONE
    extra = {
        "solution_substep": SUB_AWAITING_DONE,
        "delivery_emitted": True,
    }
    return delivery, extra


_DELIVERY_SYSTEM = """
You are Souli's practice guide. The user is settled and ready to begin a
practice. You will write a SINGLE message containing the full practice as
a numbered step-by-step list.

Output rules:
  - Open with one short warm sentence (max 12 words) naming the practice.
  - Then a numbered list of 4 to 8 steps. One action per step.
  - Each step is one sentence, clear and physical.
  - No spiritual jargon unless it is in the practice text below.
  - If the practice has chanting and you were given that practice, include
    the chant exactly as written; do not invent mantras.
  - Close with this exact line: "Take your time with each step. Let me
    know when you're done, or if you have a question about any step."
  - Do NOT ask interactive questions in the middle of the list.
  - Do NOT split into sub-headers. Just intro + numbered list + closing line.

Output ONLY this JSON:
{
  "message": "<the full message text shown to the user>"
}
"""


def _build_delivery_message(
    practice: Optional[Dict],
    llm:      "GeminiLLM",
) -> str:
    """
    Generate the one-shot numbered step message via Pro.
    Falls back to a templated breathing practice if the LLM call fails.
    """
    if not practice:
        return _fallback_breathing_steps()

    user_block = (
        f"Practice name: {practice['name']}\n"
        f"Duration: about {practice['duration_min']} minutes\n\n"
        f"Practice content from Souli's library:\n"
        f"\"\"\"\n{(practice.get('text') or '')[:1500]}\n\"\"\"\n\n"
        f"Write the message now."
    )

    try:
        result = llm.chat_json(
            system=_DELIVERY_SYSTEM,
            messages=[{"role": "user", "content": user_block}],
        )
        msg = (result.get("message") or "").strip()
        if msg:
            return msg
    except Exception as exc:
        logger.warning("[solution_engine] delivery generation failed: %s", exc)

    return _fallback_breathing_steps()


def _fallback_breathing_steps() -> str:
    return (
        "Let's do a simple grounding breath practice.\n\n"
        "1. Sit upright with your feet flat on the floor and hands resting on your thighs.\n"
        "2. Close your eyes or soften your gaze toward the floor.\n"
        "3. Breathe in slowly through your nose for a count of four.\n"
        "4. Hold gently for a count of two.\n"
        "5. Breathe out through your mouth for a count of six.\n"
        "6. Repeat this cycle ten times, letting each out-breath feel a little longer.\n"
        "7. After the tenth round, let your breath return to normal and notice how your body feels.\n\n"
        "Take your time with each step. Let me know when you're done, or if you have a question about any step."
    )


# ====================================================================== #
# Substep 3: practice done OR a clarifying question
# ====================================================================== #

def _handle_practice_done(
    state:     "GeminiState",
    user_text: str,
    llm:       "GeminiLLM",
) -> Tuple[str, Dict]:
    """
    Decide whether the user finished the practice or is asking a question.
    If finished, move to reflection. If question, answer it and stay here.
    """
    decision = _classify_done_or_question(user_text, llm)

    if decision == "done":
        state.practice_done = True
        state.solution_substep = SUB_AWAITING_REFLECTION
        reply = (
            "Good. Stay with that for a moment. "
            "When you're ready, tell me — what do you notice now, "
            "in your body or your mind?"
        )
        extra = {
            "solution_substep": SUB_AWAITING_REFLECTION,
            "practice_done":    True,
        }
        return reply, extra

    answer = _answer_practice_question(state, user_text, llm)
    extra = {
        "solution_substep":  SUB_AWAITING_DONE,
        "question_answered": True,
    }
    return answer, extra


def _classify_done_or_question(user_text: str, llm: "GeminiLLM") -> str:
    """
    Returns "done" or "question". Defaults to "question" on ambiguity so
    we don't push the user past a real concern.
    """
    text = (user_text or "").strip()
    if not text:
        return "question"

    system = (
        "Classify one short user message during a guided practice. "
        "Return ONLY this JSON: {\"intent\": \"done\" | \"question\"}. "
        "\"done\"     = user finished the practice (done, finished, completed, "
        "ok done, ready, that was nice, ho gaya, finished it). "
        "\"question\" = user is asking about a step, expressing confusion, "
        "or unsure how to do something."
    )
    try:
        result = llm.chat_json(
            system=system,
            messages=[{"role": "user", "content": text}],
            temperature=0.0,
        )
        intent = (result.get("intent") or "").strip().lower()
        return "done" if intent == "done" else "question"
    except Exception as exc:
        logger.warning("[solution_engine] done/question classify failed: %s", exc)
        return "question"


_QA_SYSTEM = """
The user is partway through a practice you delivered. They have a
question or hesitation about one of the steps. Answer in 1-3 short
sentences. Be calm and concrete. Do not re-list the whole practice. Do
not ask follow-up questions. End with: "Carry on when you're ready."

Output ONLY: {"answer": "<your reply>"}
"""


def _answer_practice_question(
    state:     "GeminiState",
    user_text: str,
    llm:       "GeminiLLM",
) -> str:
    practice_text = ""
    if state.practice_chosen:
        practice_text = (state.practice_chosen.get("text") or "")[:800]

    user_block = (
        f"Practice they are doing:\n\"\"\"\n{practice_text}\n\"\"\"\n\n"
        f"Their question:\n\"{user_text}\"\n\n"
        f"Answer it."
    )
    try:
        result = llm.chat_json(
            system=_QA_SYSTEM,
            messages=[{"role": "user", "content": user_block}],
        )
        answer = (result.get("answer") or "").strip()
        if answer:
            return answer
    except Exception as exc:
        logger.warning("[solution_engine] practice Q&A failed: %s", exc)

    return (
        "If a step doesn't fit, just adjust it gently — there's no wrong way. "
        "Carry on when you're ready."
    )


# ====================================================================== #
# Substep 4: reflection -> prescription handoff
# ====================================================================== #

def _handle_reflection(
    state:     "GeminiState",
    user_text: str,
    llm:       "GeminiLLM",
) -> Tuple[str, Dict]:
    """
    Capture the user's reflection text and emit a brief acknowledgment
    that bridges into the prescription. Sets substep to prescription so
    the very next turn delivers it -- but we also could emit prescription
    on this same turn for fewer round-trips. Spec says simple text-based,
    so we deliver the prescription on the NEXT turn after one short
    acknowledgment here.
    """
    state.reflection_text = (user_text or "").strip()

    reply = (
        "That's good to hear. Sit with this for a moment longer. "
        "I want to give you a small plan to carry forward — would you "
        "like that?"
    )
    state.solution_substep = SUB_PRESCRIPTION

    extra = {
        "solution_substep": SUB_PRESCRIPTION,
        "reflection_text":  state.reflection_text[:500],
    }
    return reply, extra


# ====================================================================== #
# Substep 5: prescription delivery (terminal)
# ====================================================================== #

_PRESCRIPTION_SYSTEM = """
You are Souli, closing a session with a short personalized prescription.

You will write ONE final message containing two parts.

PART 1 - five simple daily tips, as a short bulleted list, drawn from this
universal recovery base (paraphrase, do not copy verbatim):
  - Spend 5 minutes daily in mindful breathing or gentle meditation
  - Notice your feelings without judging or pushing them away
  - Get restful sleep and eat nourishing food
  - Allow yourself to express emotions when they come up
  - Connect briefly with someone you trust and share honestly

Tailor each line lightly to the user's energy node and what they shared.
Keep each tip to one short sentence. No more than five tips.

PART 2 - a closing handoff in 2-3 sentences telling them you are sending
them a 7-day plan to deepen what they started today, and to come back
tomorrow to check in. Warm and brief. End with a single sentence that
feels like a gentle goodbye for now.

Output ONLY this JSON:
{
  "message": "<the full message: intro line, 5 tips as bullets, closing handoff>"
}

Hard rules:
  - No more than 12 lines total in the message.
  - No questions at the end.
  - Do not mention HITL, coaching, or paid programs.
  - Do not invent specifics about the user that they did not share.
"""


def _emit_prescription(
    state:     "GeminiState",
    user_text: str,
    llm:       "GeminiLLM",
) -> Tuple[str, Dict]:
    """
    Generate the final prescription message and mark the session complete.
    """
    user_block = (
        f"Energy node: {state.energy_node or 'not set'}\n"
        f"Secondary node: {state.secondary_node or 'none'}\n"
        f"What they shared (summary): {state.summary_text[:400] or 'not available'}\n"
        f"Their reflection after the practice: {state.reflection_text[:300] or 'not available'}\n\n"
        f"Write the final prescription message now."
    )

    message = ""
    try:
        result = llm.chat_json(
            system=_PRESCRIPTION_SYSTEM,
            messages=[{"role": "user", "content": user_block}],
        )
        message = (result.get("message") or "").strip()
    except Exception as exc:
        logger.warning("[solution_engine] prescription generation failed: %s", exc)

    if not message:
        message = _fallback_prescription()

    state.prescription_delivered = True
    state.solution_complete      = True
    state.solution_substep       = SUB_COMPLETE
    state.phase                  = PHASE_COMPLETE

    extra = {
        "solution_substep":       SUB_COMPLETE,
        "prescription_delivered": True,
        "terminal":               True,
    }
    return message, extra


def _fallback_prescription() -> str:
    return (
        "Here's a small plan for the next few days:\n\n"
        "- Spend five minutes each morning with slow breathing.\n"
        "- Notice your feelings without judging them.\n"
        "- Get restful sleep and eat one nourishing meal a day with attention.\n"
        "- Let yourself feel what comes up — don't push it away.\n"
        "- Reach out to one person you trust this week.\n\n"
        "I'm sending you a 7-day plan to take what we did today a little "
        "deeper. Come back tomorrow and let me know how you're doing. "
        "Take care of yourself."
    )