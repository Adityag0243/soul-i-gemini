"""
souli_pipeline/llm/gemini.py
<<<<<<< HEAD

Gemini LLM adapter — runs parallel to ollama.py. Nothing in ollama.py is touched.

Install:
    pip install google-generativeai

Environment:
    GEMINI_API_KEY=your_key_here   (in .env)

Usage:
    llm = GeminiLLM(model="gemini-2.5-flash-preview-05-20")
    data = llm.chat_json(system=SYSTEM_PROMPT, messages=[...])
    text = llm.chat(system=SYSTEM_PROMPT, messages=[...])
=======
Uses the new google-genai SDK (replaces deprecated google-generativeai).
>>>>>>> 8a1cf2387017bb70210464c72dc7d4c14c378a47
"""
from __future__ import annotations

import json
import logging
import os
from typing import Dict, List, Optional

logger = logging.getLogger(__name__)

<<<<<<< HEAD
# ── SDK availability guard ────────────────────────────────────────────────────
_SDK_AVAILABLE = False
try:
    import google.generativeai as genai  # type: ignore
    _SDK_AVAILABLE = True
except ImportError:
    logger.warning(
        "google-generativeai not installed. "
        "Run: pip install google-generativeai"
    )

_CONFIGURED = False


def _ensure_configured() -> None:
    """Configure Gemini SDK once — lazy, on first use."""
    global _CONFIGURED
    if _CONFIGURED:
        return
    if not _SDK_AVAILABLE:
        raise RuntimeError(
            "google-generativeai is not installed. "
            "Run: pip install google-generativeai"
        )
    api_key = os.environ.get("GEMINI_API_KEY", "").strip()
    if not api_key:
        raise RuntimeError(
            "GEMINI_API_KEY is not set. "
            "Add it to your .env file: GEMINI_API_KEY=your_key"
        )
    genai.configure(api_key=api_key)  # type: ignore
    _CONFIGURED = True
    logger.info("Gemini SDK configured.")


class GeminiLLM:
    """
    Thin wrapper around Google Gemini.

    Two methods:
      chat_json() → forces JSON response (uses response_mime_type), returns dict
      chat()      → plain text response, returns str

    Both accept OpenAI-style message lists:
        [{"role": "user", "content": "..."}, {"role": "assistant", "content": "..."}]
    """

=======
_client = None

def _get_client():
    global _client
    if _client is not None:
        return _client
    try:
        from google import genai  # type: ignore
    except ImportError:
        raise RuntimeError("Run: pip install google-genai")
    
    api_key = os.environ.get("GEMINI_API_KEY", "").strip()
    if not api_key:
        raise RuntimeError("GEMINI_API_KEY is not set in .env")
    
    _client = genai.Client(api_key=api_key)
    logger.info("Gemini client initialized.")
    return _client


class GeminiLLM:
>>>>>>> 8a1cf2387017bb70210464c72dc7d4c14c378a47
    def __init__(
        self,
        model: str = "gemini-2.5-flash-preview-05-20",
        temperature: float = 0.75,
        max_output_tokens: int = 1500,
    ):
<<<<<<< HEAD
        _ensure_configured()
        self.model_name       = model
        self.temperature      = temperature
        self.max_output_tokens = max_output_tokens

    # ─────────────────────────────────────────────────────────────────────────
    # Public: JSON response (pre-solution phases)
    # ─────────────────────────────────────────────────────────────────────────

=======
        self.model_name        = model
        self.temperature       = temperature
        self.max_output_tokens = max_output_tokens

>>>>>>> 8a1cf2387017bb70210464c72dc7d4c14c378a47
    def chat_json(
        self,
        system: str,
        messages: List[Dict[str, str]],
        temperature: Optional[float] = None,
    ) -> Dict:
<<<<<<< HEAD
        """
        Send a conversation and force a JSON response back.
        Gemini's response_mime_type='application/json' guarantees valid JSON
        structure — no need to parse markdown fences.

        Raises:
            json.JSONDecodeError — if Gemini somehow returns non-JSON
            RuntimeError         — if Gemini SDK call fails
        """
        _ensure_configured()
        contents = self._to_gemini_contents(messages)

        gen_cfg = genai.types.GenerationConfig(  # type: ignore
            temperature=temperature if temperature is not None else self.temperature,
            max_output_tokens=self.max_output_tokens,
            response_mime_type="application/json",
        )

        model = genai.GenerativeModel(  # type: ignore
            self.model_name,
            system_instruction=system or None,
            generation_config=gen_cfg,
        )

        try:
            response = model.generate_content(contents)
            raw = response.text.strip()
        except Exception as exc:
            raise RuntimeError(f"Gemini API call failed: {exc}") from exc

        # Strip markdown fences defensively (shouldn't appear with json mime,
        # but Gemini occasionally wraps things anyway)
        raw = _strip_json_fences(raw)

        return json.loads(raw)

    # ─────────────────────────────────────────────────────────────────────────
    # Public: Plain text response
    # ─────────────────────────────────────────────────────────────────────────

=======
        from google.genai import types  # type: ignore

        client   = _get_client()
        contents = self._to_contents(messages)

        response = client.models.generate_content(
            model=self.model_name,
            contents=contents,
            config=types.GenerateContentConfig(
                system_instruction=system or None,
                temperature=temperature if temperature is not None else self.temperature,
                max_output_tokens=self.max_output_tokens,
                response_mime_type="application/json",
            ),
        )
        raw = response.text.strip()
        raw = _strip_fences(raw)
        return json.loads(raw)

>>>>>>> 8a1cf2387017bb70210464c72dc7d4c14c378a47
    def chat(
        self,
        system: str,
        messages: List[Dict[str, str]],
        temperature: Optional[float] = None,
    ) -> str:
<<<<<<< HEAD
        """Plain text response — fallback or non-JSON use cases."""
        _ensure_configured()
        contents = self._to_gemini_contents(messages)

        gen_cfg = genai.types.GenerationConfig(  # type: ignore
            temperature=temperature if temperature is not None else self.temperature,
            max_output_tokens=self.max_output_tokens,
        )

        model = genai.GenerativeModel(  # type: ignore
            self.model_name,
            system_instruction=system or None,
            generation_config=gen_cfg,
        )

        try:
            response = model.generate_content(contents)
            return response.text.strip()
        except Exception as exc:
            raise RuntimeError(f"Gemini API call failed: {exc}") from exc

    # ─────────────────────────────────────────────────────────────────────────
    # Internal helpers
    # ─────────────────────────────────────────────────────────────────────────

    @staticmethod
    def _to_gemini_contents(messages: List[Dict[str, str]]) -> List[Dict]:
        """
        Convert OpenAI-style messages to Gemini format.

        OpenAI:  {"role": "user"|"assistant"|"system", "content": "..."}
        Gemini:  {"role": "user"|"model",              "parts": ["..."]}

        System messages are handled via system_instruction param, not here.
        """
        contents = []
        for m in messages:
            role = m.get("role", "user")
            content = m.get("content", "")
            if role == "system":
                # system messages are passed as system_instruction — skip here
                continue
            gemini_role = "user" if role == "user" else "model"
            contents.append({"role": gemini_role, "parts": [content]})

        # Gemini requires the conversation to start with a user message
        # and alternate user/model. If it starts with model, prepend an empty user.
        if contents and contents[0]["role"] == "model":
            contents.insert(0, {"role": "user", "parts": ["(start of conversation)"]})

        # Gemini also requires that turns alternate properly.
        # Deduplicate consecutive same-role messages by merging content.
        merged = []
        for turn in contents:
            if merged and merged[-1]["role"] == turn["role"]:
                merged[-1]["parts"][0] += "\n" + turn["parts"][0]
            else:
                merged.append(turn)

        return merged


# ─────────────────────────────────────────────────────────────────────────────
# Utility
# ─────────────────────────────────────────────────────────────────────────────

def _strip_json_fences(raw: str) -> str:
    """Remove ```json ... ``` or ``` ... ``` wrappers if present."""
    raw = raw.strip()
    if raw.startswith("```"):
        lines = raw.splitlines()
        # Remove first line (```json or ```)
        lines = lines[1:]
        # Remove last line if it's just ```
        if lines and lines[-1].strip() == "```":
            lines = lines[:-1]
        raw = "\n".join(lines).strip()
    return raw
=======
        from google.genai import types  # type: ignore

        client   = _get_client()
        contents = self._to_contents(messages)

        response = client.models.generate_content(
            model=self.model_name,
            contents=contents,
            config=types.GenerateContentConfig(
                system_instruction=system or None,
                temperature=temperature if temperature is not None else self.temperature,
                max_output_tokens=self.max_output_tokens,
            ),
        )
        return response.text.strip()

    @staticmethod
    def _to_contents(messages: List[Dict[str, str]]) -> List[Dict]:
        contents = []
        for m in messages:
            role    = m.get("role", "user")
            content = m.get("content", "")
            if role == "system":
                continue
            gemini_role = "user" if role == "user" else "model"
            contents.append({"role": gemini_role, "parts": [{"text": content}]})

        # Must start with user turn
        if contents and contents[0]["role"] == "model":
            contents.insert(0, {"role": "user", "parts": [{"text": "(start)"}]})

        # Merge consecutive same-role turns
        merged = []
        for turn in contents:
            if merged and merged[-1]["role"] == turn["role"]:
                merged[-1]["parts"][0]["text"] += "\n" + turn["parts"][0]["text"]
            else:
                merged.append(turn)
        return merged


def _strip_fences(raw: str) -> str:
    raw = raw.strip()
    if raw.startswith("```"):
        lines = raw.splitlines()[1:]
        if lines and lines[-1].strip() == "```":
            lines = lines[:-1]
        raw = "\n".join(lines).strip()
    return raw
>>>>>>> 8a1cf2387017bb70210464c72dc7d4c14c378a47
