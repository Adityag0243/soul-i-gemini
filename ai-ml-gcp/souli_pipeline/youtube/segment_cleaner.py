"""
souli_pipeline/youtube/segment_cleaner.py

Cleans one TopicSegment using llama3.1 via Ollama.

The cleaning goal is NOT summarisation.
It is rewriting messy spoken transcript into clean, readable prose that:
  - Preserves 100% of the teaching content
  - Removes filler, repetition, incomplete sentences
  - Maintains the coach's voice and style
  - Reads like a written transcript, not a cleaned-up notes version

Has retry logic — if LLM output is too short or malformed, retries once
with a stricter prompt.

CHANGE: clean_all_segments() now runs chunks in PARALLEL using ThreadPoolExecutor.
        No new libraries needed — ThreadPoolExecutor is built into Python.
        Control parallel level with max_workers (default 4).
"""
from __future__ import annotations

import logging
import re
from concurrent.futures import ThreadPoolExecutor, as_completed
from typing import Optional

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Prompts  (unchanged)
# ---------------------------------------------------------------------------

_SYSTEM_PROMPT = """\
You are a professional transcript editor working with wellness counseling videos.
Your job is to clean spoken transcripts into clear, readable prose.

STRICT RULES:
- Preserve EVERY teaching point, insight, and example. Do not summarise or shorten.
- Keep the coach's voice, tone, and sentence patterns intact.
- Remove: filler words (uh, um, like, you know), incomplete sentences, repeated phrases.
- Do NOT add new content. Do NOT explain or comment on what the coach said.
- Output only the cleaned transcript text. No headings, no bullet points, no preamble.
- Minimum output length: 60% of input word count.
"""

_USER_PROMPT = """\
Clean this spoken transcript segment. Preserve all content and the speaker's voice.

TRANSCRIPT:
\"\"\"
{text}
\"\"\"

Cleaned transcript:"""

_RETRY_SYSTEM_PROMPT = """\
You are a transcript editor. Your ONLY task is to lightly clean spoken text.
Remove filler words and obvious repetitions ONLY.
Keep everything else exactly as spoken. Do not summarise. Do not shorten.
Output only the cleaned text with no other words.
"""

_RETRY_USER_PROMPT = """\
Remove filler words and repetitions from this text. Keep all content.

TEXT:
\"\"\"
{text}
\"\"\"

Output:"""


# ---------------------------------------------------------------------------
# Validation  (unchanged)
# ---------------------------------------------------------------------------

def _is_valid_output(original: str, cleaned: str, min_retention: float = 0.55) -> bool:
    """
    Returns True if output retains at least min_retention fraction of word count.
    """
    if not cleaned or not cleaned.strip():
        return False
    orig_words    = len(original.split())
    cleaned_words = len(cleaned.split())
    if orig_words == 0:
        return False
    retention = cleaned_words / orig_words
    if retention < min_retention:
        logger.warning(
            "Cleaning output too short (%.0f%% retention, min %.0f%%). Will retry.",
            retention * 100, min_retention * 100,
        )
        return False
    return True


def _postprocess(text: str) -> str:
    """Final cleanup of LLM output — remove any preamble lines it might add."""
    t = text.strip()
    preamble_re = re.compile(
        r"^(cleaned transcript|here is|here's|output|result)[:\s].*\n?",
        re.IGNORECASE | re.MULTILINE,
    )
    t = preamble_re.sub("", t).strip()
    t = re.sub(r"\n{3,}", "\n\n", t)
    t = re.sub(r" {2,}", " ", t)
    return t.strip()


# ---------------------------------------------------------------------------
# Single segment cleaning  (unchanged)
# ---------------------------------------------------------------------------

def clean_segment(
    text: str,
    ollama_model: str = "llama3.1",
    ollama_endpoint: str = "http://localhost:11434",
    num_ctx: int = 8192,
    temperature: float = 0.3,
) -> str:
    """
    Clean a single transcript segment using llama3.1.
    Falls back to light regex cleaning if Ollama is unavailable.
    """
    text = (text or "").strip()
    if not text:
        return ""

    try:
        from souli_pipeline.llm.ollama import OllamaLLM

        llm = OllamaLLM(
            model=ollama_model,
            endpoint=ollama_endpoint,
            timeout_s=180,
            temperature=temperature,
            num_ctx=num_ctx,
        )

        if not llm.is_available():
            logger.warning("Ollama not available — using regex fallback for cleaning.")
            return _regex_clean_fallback(text)

        # First attempt
        prompt = _USER_PROMPT.format(text=text[:4000])
        cleaned = llm.generate(prompt=prompt, system=_SYSTEM_PROMPT, temperature=temperature)
        cleaned = _postprocess(cleaned)

        # Retry if output is too short
        if not _is_valid_output(text, cleaned):
            logger.info("Retrying segment cleaning with stricter prompt...")
            retry_prompt = _RETRY_USER_PROMPT.format(text=text[:4000])
            cleaned = llm.generate(
                prompt=retry_prompt,
                system=_RETRY_SYSTEM_PROMPT,
                temperature=0.1,
            )
            cleaned = _postprocess(cleaned)

            if not _is_valid_output(text, cleaned, min_retention=0.4):
                logger.warning("LLM cleaning still inadequate — using regex fallback.")
                return _regex_clean_fallback(text)

        return cleaned

    except Exception as e:
        logger.warning("Segment cleaning error: %s — using regex fallback.", e)
        return _regex_clean_fallback(text)


def _regex_clean_fallback(text: str) -> str:
    """Light regex-based cleaning when Ollama is unavailable."""
    t = text
    t = re.sub(r"\[.*?\]|\(.*?\)", " ", t)
    t = re.sub(r"\b(uh+|um+|hmm+|hm+|ah+|you know,?\s*)\b", " ", t, flags=re.IGNORECASE)
    t = re.sub(r"\b(\w+)\s+\1\b", r"\1", t, flags=re.IGNORECASE)
    t = re.sub(r"\s+", " ", t).strip()
    return t


# ---------------------------------------------------------------------------
# Batch cleaning — PARALLEL  (only this function changed)
# ---------------------------------------------------------------------------

def clean_all_segments(
    topic_segments,
    ollama_model: str = "llama3.1",
    ollama_endpoint: str = "http://localhost:11434",
    num_ctx: int = 8192,
    temperature: float = 0.3,
    log_every: int = 3,
    max_workers: int = 4,          # ← NEW param, default 4
) -> list:
    """
    Clean all TopicSegment objects in PARALLEL.

    How it works:
      Before: chunk1 → wait → chunk2 → wait → chunk3 → wait ...
      After:  chunk1, chunk2, chunk3 all sent to Ollama at the same time → wait once

    max_workers = how many chunks run in parallel.
      - Start with 4 on your AWS GPU.
      - If Ollama starts giving errors or timeouts → lower to 2 or 3.
      - If all is stable → try 6.

    Returns results in the SAME ORDER as input (order is preserved).
    """
    total = len(topic_segments)
    logger.info(
        "[segment_cleaner] Parallel cleaning: %d segments, max_workers=%d",
        total, max_workers,
    )

    results_map = {}   # index → result dict, filled as threads complete
    completed_count = 0

    def _clean_one(index: int, seg) -> tuple:
        """Worker: cleans one segment, returns (original_index, result_dict)."""
        cleaned = clean_segment(
            text=seg.text,
            ollama_model=ollama_model,
            ollama_endpoint=ollama_endpoint,
            num_ctx=num_ctx,
            temperature=temperature,
        )
        return index, {
            "topic_index":    seg.topic_index,
            "start":          seg.start,
            "end":            seg.end,
            "original_text":  seg.text,
            "cleaned_text":   cleaned,
            "original_words": seg.word_count,
            "cleaned_words":  len(cleaned.split()),
        }

    with ThreadPoolExecutor(max_workers=max_workers) as executor:
        # Submit all at once
        future_to_index = {
            executor.submit(_clean_one, i, seg): i
            for i, seg in enumerate(topic_segments)
        }

        # Collect as each finishes (order doesn't matter here, we use index)
        for future in as_completed(future_to_index):
            completed_count += 1
            try:
                index, result = future.result()
                results_map[index] = result

                if completed_count % log_every == 0 or completed_count == total:
                    logger.info(
                        "[segment_cleaner] %d/%d segments cleaned...",
                        completed_count, total,
                    )
            except Exception as exc:
                # One chunk failed — use regex fallback, don't crash the whole pipeline
                i = future_to_index[future]
                seg = topic_segments[i]
                logger.error("[segment_cleaner] Segment %d failed: %s — using regex fallback.", i, exc)
                results_map[i] = {
                    "topic_index":    seg.topic_index,
                    "start":          seg.start,
                    "end":            seg.end,
                    "original_text":  seg.text,
                    "cleaned_text":   _regex_clean_fallback(seg.text),
                    "original_words": seg.word_count,
                    "cleaned_words":  len(seg.text.split()),
                }

    # Rebuild in original order
    results = [results_map[i] for i in range(total)]
    logger.info("[segment_cleaner] Done: %d segments cleaned.", len(results))
    return results