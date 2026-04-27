"""
Counselor response generator.

Uses Ollama llama3.1 + RAG context from Qdrant to generate responses
that mirror the warm, grounded style of the Souli video counselor.

All inference is local. No data leaves the machine.
"""
from __future__ import annotations

import logging
import re
from typing import Dict, Generator, List, Optional

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# System prompt — defines counselor personality
# ---------------------------------------------------------------------------

_COUNSELOR_SYSTEM_BASE = """\
You are Souli — a calm, intelligent presence and a companion for emotional support.
Your goal is to make the person feel heard and to make movement feel possible, without pushing for change.

Personality:
- Grounded and warm, but not overly cheerful or motivational.
- Simple, everyday language. No therapy jargon or "fixing" language.
- Match the person's energy. Casual with casual. Never dramatic.

When they share pain — acknowledge ONE specific thing they mentioned, then ask one small question.
DO NOT summarize their whole situation back to them. DO NOT ask a question they just answered.

BAD example (do not do this):
  User: "my bf ignores me, manager never appreciates my work, i feel invisible everywhere"
  BAD: "It sounds like you're feeling stuck. Do you feel this at work or in personal life?"
  Why bad: They just said everywhere. You repeated their words and asked what they answered.

GOOD example (do this):
  User: "my bf ignores me, manager never appreciates my work, i feel invisible everywhere"
  GOOD: "Feeling invisible no matter where you go — that's exhausting. How long has it been like this?"
  Why good: Named the one underlying feeling (invisible). Asked something they haven't answered yet.

Note — only ask "which feels heavier" when someone shares two clearly separate problems (job loss AND a breakup). 
If it's the same feeling showing up in different places, acknowledge the pattern, not the individual places.

When reference content is provided, do two things: 
    1. mirror the tone and phrasing style you see in that content — that is how Souli speaks, 
    2. use any relevant knowledge from it to make your response specific to this person's situation.Do not copy it word for word. Let it shape how you respond.

Hard rules:
- ONE question per reply maximum.
- Never ask something they already answered. Read what they said carefully before asking.
- Never say until summary phase "It sounds like", "I can sense", "It seems", "It appears", "I understand".
- Never use "we" — this is their experience, not yours.
- If they ask for a solution, give it. Stop asking questions.
- Never give medical advice.
- If they directly or indirectly tell something related to self harm, suicidal thoughts, self harm, ask them to reach out to professional help immediately and ask them to go to hospital or close one.

- CRITICAL: When reflecting what someone said, stay very close to their actual words. Never flip or reinterpret the meaning. If they said "people get jealous of me", do NOT say "you feel unseen" — those are opposites. Mirror what they said.
- If you are unsure what they mean, without any doubt ask a clarifying question — do NOT guess and state the guess as a fact or assume anything you can ask for some example for instance like 'can you tell me one specific example of what you mean' or 'can you give me an example of what you mean'.
"""


def _build_counselor_system(
    user_name: Optional[str] = None,
    phase: Optional[str] = None,
    asked_topics: Optional[List[str]] = None,
    last_souli_question: Optional[str] = None,
) -> str:

    system = _COUNSELOR_SYSTEM_BASE
    
    context_additions = []
    if user_name:
        context_additions.append(f"The person's name is {user_name}.")
    
    if phase == "intake":
        context_additions.append(
            "PHASE: Intake. The person just started sharing. "
            "Your ONLY job is to make them feel heard and invite them to say more."
            "Ask question which is related to the problem they are facing if user has not mentioned it fully in detail or straight forward whole problem ask them about it make them comfortable to share more ask such one question related to there problem."
            "DO NOT ask philosophical or identity questions. "
            "DO NOT suggest practices or reflection exercises. "
            "Acknowledge ONE specific thing they said, then ask ONE simple follow-up about their daily experience. "
            "Max 2 sentences."
        )
    elif phase == "venting" or phase == "sharing":
        context_additions.append(
            "PHASE: Sharing. The person is opening up — they feel safe now. "
            "DO NOT repeat empathy phrases like 'I hear you' or 'that makes sense' at every reply. "
            "Instead: briefly reflect the specific thing they just said (not their overall emotion), "
            "then ask ONE precise question about what they mentioned — a name, a moment, a pattern. "
            "Think like a curious friend, not a therapist. No reassurance. Max 2 sentences."
        )
    elif phase == "deepening":
        context_additions.append(
            "PHASE: Deepening. You already know the person's main struggle. "
            "Your job now is to understand their daily experience better. "
            "For one or two deepening questions, first acknowledge ONE specific thing they just said — something they actually mentioned, but after that DO NOT show empathy or reassurance again — they already feel heard."
            "After that your only job left is : ask ONE sharp, specific question that goes deeper into what they said."
            "The question must be about something concrete they mentioned — a person, situation, or pattern. "
            "Ask something that will reveal a detail you don't know yet and haven't asked before. "
            "Example — User says 'I feel no energy': "
            "WRONG: 'You've been giving a lot — what feels most draining?' (too broad, still empathy-flavored) "
            "RIGHT: 'You're managing work well — what part of it feels heaviest right now?' (specific, direct) "
            "No reassurance after 1 or 2 turn of deepening. Just RAG knowledge base context (that too if it relevant) + the question."
            "DO NOT ask philosophical or identity questions. "
            "DO NOT use therapy language like 'sense of control' or 'confidence'. "
            "Max 2-3 sentences total."
        )

    if last_souli_question:
        context_additions.append(
            f"Last thing Souli asked: {last_souli_question}\n"
            "DO NOT ask the similar question again."
        )
    if asked_topics:
        context_additions.append(f"Already discussed: {', '.join(asked_topics)}.")

    if context_additions:
        system += "\n\n[Current Session Context]\n" + "\n".join(context_additions)
    
    return system


_SOLUTION_SYSTEM = """\
You are Souli, a warm and practical inner wellness guide.
The person has asked for guidance. Provide it with warmth and clarity.

STRICT RULES — follow exactly:
1. ONLY reference things the person EXPLICITLY said in this conversation. 
   If they did not mention a relationship, do NOT mention relationships.
   If they did not mention a hobby, do NOT mention hobbies.
   If they did not name a person, do NOT name a person.
2. Do NOT invent or assume details about their life. If context is thin, keep the response general but warm.
3. Do NOT use generic motivational phrases like "you've got this" or "believe in yourself".
4. Reference the teaching content to shape your tone and approach — but do not treat it as facts about this person.

Format: 2-3 short paragraphs. No numbered lists unless presenting multiple practices.
Present practices as gentle invitations, not prescriptions.
"""


# ---------------------------------------------------------------------------
# Prompt builders
# ---------------------------------------------------------------------------
# Maps chunk_type values to human-readable labels for the LLM prompt
_CHUNK_TYPE_LABELS = {
    "healing":    "[HEALING PRINCIPLE]",
    "activities": "[PRACTICE / ACTIVITY]",
    "stories":    "[STORY / METAPHOR]",
    "commitment": "[REFLECTION QUESTION]",
    "patterns":   "[PROBLEM PATTERN]",
    "general":    "[TEACHING REFERENCE]",
    "teaching":   "[TEACHING REFERENCE]",   # legacy chunk_type from old ingestion
}


def _build_rag_context(chunks: List[Dict]) -> str:
    """
    Build the RAG context block injected into the counselor prompt.

    Each chunk is labelled by its type (e.g. [HEALING PRINCIPLE]) so the LLM
    knows HOW to use each piece of content — whether it's a story to echo,
    a practice to suggest, or a reflection question to ask.

    Score threshold: 0.35 (lowered from 0.50 because typed collections are
    more specific — a healing chunk in souli_healing has inherently higher
    precision even at moderate similarity scores).
    """
    if not chunks:
        return ""

    good_chunks = [c for c in chunks if c.get("score", 0) >= 0.35]

    if not good_chunks:
        return ""

    lines = ["[Teaching Reference — how Souli's counselor handles similar moments:]"]
    for c in good_chunks[:4]:          # allow up to 4 (vs old 3) since typed chunks are shorter
        text = (c.get("text") or "").strip()
        if not text:
            continue
        chunk_type = c.get("chunk_type", "general")
        label = _CHUNK_TYPE_LABELS.get(chunk_type, "[TEACHING REFERENCE]")
        lines.append(f"{label} {text[:350]}")

    return "\n".join(lines)

def _build_chat_messages(
    history: List[Dict[str, str]],
    user_message: str,
    rag_chunks: List[Dict],
    energy_node: Optional[str] = None,
) -> List[Dict[str, str]]:
    """
    Build the messages list for Ollama chat.
    Injects RAG context as a system-level assistant hint before the user message.
    """
    messages = list(history)  # copy existing history

    # Inject RAG context as a contextual hint (injected as assistant pre-context)
    rag_text = _build_rag_context(rag_chunks)
    if rag_text:
        messages.append({
            "role": "user", 
            "content": f"[CONTEXT — teaching reference, not from user]:\n{rag_text}"
        })

    messages.append({"role": "user", "content": user_message})
    return messages


def _build_solution_prompt(
    energy_node: str,
    framework_solution: Dict,
    user_context: str,
    activity_chunks: List[Dict] = None,
) -> str:
    node_label = energy_node.replace("_", " ").title()

    practices = framework_solution.get("primary_practices ( 7 min quick relief)", "")
    healing = framework_solution.get("primary_healing_principles", "")
    deeper = framework_solution.get("deeper_meditations_program ( 7 day quick recovery)", "")
    activity_detail = ""
    if activity_chunks:
        detail_lines = [c["text"] for c in activity_chunks[:3] if c.get("text")]
        if detail_lines:
            activity_detail = "\n".join(detail_lines)

    # Take last 300 chars of context — the most recent/emotionally loaded part

    recent_context = user_context[-300:].strip() if len(user_context) > 300 else user_context.strip()

    prompt = (
        f"The person is experiencing {node_label}.\n\n"
        f"Here is exactly what they shared in this conversation — use ONLY this, nothing else:\n"
        f"{recent_context}\n\n"
        f"IMPORTANT: Only reference things they actually mentioned above which is said by user not from the framework or Knowledge Base. "
        f"If they only said they feel drained or tired, that's all you have — don't invent details.\n\n"
        f"Healing principles to weave in naturally: {healing[:400]}\n\n"
        f"Take any one or two relevant practice from {activity_detail[:400]} + {practices[:300]} invite user with gentle language to try it out. Do NOT present practices as a list — instead, weave them into your suggestions in a warm, personalized way."
        f"Gentle language example 'I found a practice that helps clear mental fog by balancing your breath. It takes about 4 minutes. Would you like to try it with me?', how it helps + how much time it takes + invitation to try it."
        f"Make sure suggested practice or activity is well instructed with clear step by step instructions if it's not a common practice. If it is a common practice like journaling or walking, then no need for instructions just invite them to do it in a warm way. "
        f"Deeper recovery if they want to go further: {deeper[:200]}\n\n"
        f"Write a warm, personal response. Do NOT write generic wellness advice. "
        f"The person should feel you understood THEIR situation specifically."
    )
    return prompt


# ---------------------------------------------------------------------------
# Main response functions
# ---------------------------------------------------------------------------

def generate_counselor_response(
    history: List[Dict[str, str]],
    user_message: str,
    rag_chunks: List[Dict],
    energy_node: Optional[str] = None,
    ollama_model: str = "llama3.1",
    ollama_endpoint: str = "http://localhost:11434",
    temperature: float = 0.75,
    stream: bool = False,
    user_name: Optional[str] = None,
    phase: Optional[str] = None,
    asked_topics: Optional[List[str]] = None,
    last_souli_question: Optional[str] = None,
    system_override: Optional[str] = None, 
) -> str | Generator[str, None, None]:
    """
    Generate an empathetic counselor response using Ollama llama3.1 + RAG.

    stream=True returns a generator of text chunks.
    stream=False returns the full response string.
    """
    from ..llm.ollama import OllamaLLM

    llm = OllamaLLM(
        model=ollama_model,
        endpoint=ollama_endpoint,
        temperature=temperature,
        num_ctx=2048,
    )

    messages = _build_chat_messages(history, user_message, rag_chunks, energy_node)
    system = _build_counselor_system(user_name=user_name, phase=phase, asked_topics=asked_topics)

    if system_override:       
        system = system_override  
    if stream:
        return llm.chat_stream(messages, system=system, temperature=temperature)
    else:
        return llm.chat(messages, system=system, temperature=temperature)


def generate_solution_response(
    energy_node: str,
    framework_solution: Dict,
    user_context: str,
    ollama_model: str = "llama3.1",
    ollama_endpoint: str = "http://localhost:11434",
    temperature: float = 0.65,
    stream: bool = False,
) -> str | Generator[str, None, None]:
    """
    Generate a solution-mode response: warm presentation of practices + meditations.
    """
    from ..llm.ollama import OllamaLLM
    
    activity_chunks = []
    try:
        from ..retrieval.qdrant_store_multi import query_by_phase
        activity_chunks = query_by_phase(
            user_text=user_context[-200:],
            phase="solution",
            energy_node=energy_node,
            top_k=3,
        )
        # Keep only activity type
        activity_chunks = [c for c in activity_chunks if c.get("chunk_type") == "activities"]
    except Exception as e:
        logger.warning("Could not fetch activity chunks for solution: %s", e)
    

    llm = OllamaLLM(
        model=ollama_model,
        endpoint=ollama_endpoint,
        temperature=temperature,
        num_ctx=2048,
    )

    prompt = _build_solution_prompt(energy_node, framework_solution, user_context, activity_chunks)
    messages = [{"role": "user", "content": prompt}]

    if stream:
        return llm.chat_stream(messages, system=_SOLUTION_SYSTEM, temperature=temperature)
    else:
        return llm.chat(messages, system=_SOLUTION_SYSTEM, temperature=temperature)



_ACTIVITY_SYSTEM = """\
You are Souli, a warm inner wellness guide.
The person has agreed to try an activity. Now give them clear, step-by-step instructions.
Be specific. Be encouraging. Keep it short — 150-200 words max.
End with one gentle reminder about how to carry this feeling forward in their day.
"""
def _build_activity_steps_prompt(
    energy_node: str,
    framework_solution: Dict,
    user_context: str,
    activity_chunks: List[Dict] = None,   # ← Qdrant se aaye detailed instructions
) -> str:
    practices = framework_solution.get("primary_practices ( 7 min quick relief)", "")
    healing = framework_solution.get("primary_healing_principles", "")
    node_label = energy_node.replace("_", " ").title()

    # ── Activity detail source: Qdrant first, Excel fallback ──────────
    if activity_chunks:
        # Qdrant mein real step-by-step instructions hain
        best = activity_chunks[0]
        activity_detail = (
            f"Activity: {best.get('activity_name', 'Practice')}\n"
            f"When to use: {best.get('trigger_state', '')}\n"
            f"Duration: {best.get('duration_minutes', '?')} minutes\n"
            f"Instructions: {best.get('text', '')}\n"
            f"Person will feel: {best.get('outcome', '')}"
        )
    else:
        # Qdrant empty hai (abhi tak koi video ingest nahi hua) — Excel fallback
        activity_name = practices.split(",")[0].strip() if practices else "a grounding practice"
        activity_detail = f"Practice: {practices[:300]}"

    return (
        f"The person has {node_label} and just agreed to try an activity.\n\n"
        f"What they shared: {user_context[-200:].strip()}\n\n"
        f"Activity to guide them through:\n{activity_detail}\n\n"
        f"Core healing principle to weave in at the end: {healing[:200]}\n\n"
        f"Give them step-by-step instructions for '{activity_name}' — "
        f"numbered steps, warm tone, 150-200 words. "
        f"End with one sentence reminding them how to carry this feeling into their day."
    )

def generate_activity_steps_response(
    energy_node: str,
    framework_solution: Dict,
    user_context: str,
    ollama_model: str = "llama3.1",
    ollama_endpoint: str = "http://localhost:11434",
    qdrant_host: str = "localhost",      # ← ADD
    qdrant_port: int = 6333,             # ← ADD
    temperature: float = 0.6,
    stream: bool = False,
):
    from ..llm.ollama import OllamaLLM

    # ── Qdrant se activity chunks fetch karo ─────────────────────────
    activity_chunks = []
    try:
        from ..retrieval.qdrant_store_multi import query_by_phase
        all_chunks = query_by_phase(
            user_text=user_context[-300:],
            phase="solution",
            energy_node=energy_node,
            top_k=3,
            host=qdrant_host,
            port=qdrant_port,
        )
        # Sirf activities type ke chunks chahiye
        activity_chunks = [c for c in all_chunks if c.get("chunk_type") == "activities"]
        if activity_chunks:
            logger.info("[SOLUTION] Fetched %d activity chunks from Qdrant for %s", 
                       len(activity_chunks), energy_node)
        else:
            logger.info("[SOLUTION] No Qdrant activity chunks found — using Excel fallback")
    except Exception as e:
        logger.warning("[SOLUTION] Qdrant activity fetch failed: %s", e)
    # ─────────────────────────────────────────────────────────────────

    llm = OllamaLLM(
        model=ollama_model,
        endpoint=ollama_endpoint,
        temperature=temperature,
        num_ctx=2048,
    )
    prompt = _build_activity_steps_prompt(
        energy_node, framework_solution, user_context, activity_chunks  # ← pass karo
    )
    messages = [{"role": "user", "content": prompt}]
    if stream:
        return llm.chat_stream(messages, system=_ACTIVITY_SYSTEM, temperature=temperature)
    else:
        return llm.chat(messages, system=_ACTIVITY_SYSTEM, temperature=temperature)



def fallback_response(energy_node: Optional[str], user_text: str = "") -> str:
    logger.warning("Ollama unavailable — using fallback response.... [check counselor.py]")
    """Simple fallback when Ollama is unavailable. Varies based on user_text length."""
    import hashlib
    # Pick a variant based on user text so it doesn't repeat
    variant = int(hashlib.md5((user_text or "x").encode()).hexdigest(), 16) % 3

    node_responses = {
        "blocked_energy": [
            "That sounds really heavy. What part of it is weighing on you the most right now?",
            "I hear you. It's okay to not have it figured out. What feels hardest in this moment?",
            "You don't have to carry this alone. What would feel like a small relief right now?",
        ],
        "depleted_energy": [
            "You've been giving a lot, haven't you. What's draining you the most?",
            "That tiredness is real. When did you last feel like yourself?",
            "It sounds like you've been running on empty. What does your day usually look like?",
        ],
        "scattered_energy": [
            "Everything seems to be pulling at you at once. What's the loudest thing on your mind?",
            "That overwhelm makes sense. Which part of this feels hardest to handle?",
            "You're juggling a lot. What would help you feel even slightly more settled?",
        ],
        "outofcontrol_energy": [
            "There's a lot of intensity in what you're carrying. What triggered this the most?",
            "Those feelings are valid. What's been building up inside you?",
            "I'm here with you. What do you most need right now — to be heard, or to find a way through?",
        ],
        "normal_energy": [
            "That's interesting — what's been on your mind lately?",
            "I'm curious — what brought you here today?",
            "Tell me more — what's been sitting with you?",
        ],
    }
    options = node_responses.get(energy_node or "", [
        "I'm here with you. Tell me more about what's going on.",
        "That makes sense. What's been the hardest part?",
        "I hear you. What would feel helpful right now?",
    ])
    return options[variant % len(options)]
