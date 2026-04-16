"""
souli_pipeline/llm/gemini.py
Uses the new google-genai SDK (replaces deprecated google-generativeai).
"""
from __future__ import annotations

import json
import logging
import os
from typing import Dict, List, Optional

logger = logging.getLogger(__name__)

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
    def __init__(
        self,
        model: str = "gemini-2.5-flash-preview-05-20",
        temperature: float = 0.75,
        max_output_tokens: int = 1500,
    ):
        self.model_name        = model
        self.temperature       = temperature
        self.max_output_tokens = max_output_tokens

    def chat_json(
        self,
        system: str,
        messages: List[Dict[str, str]],
        temperature: Optional[float] = None,
    ) -> Dict:
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

    def chat(
        self,
        system: str,
        messages: List[Dict[str, str]],
        temperature: Optional[float] = None,
    ) -> str:
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
