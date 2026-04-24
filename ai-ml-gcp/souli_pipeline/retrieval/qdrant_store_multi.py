"""
souli_pipeline/retrieval/qdrant_store_multi.py

Qdrant store for the multi-collection ingestion pipeline.

Handles:
  1. Ingesting typed extractor chunks into specialist collections
  2. Ingesting general cleaned chunks into souli_chunks_improved (reuses existing function)
  3. Phase-aware retrieval — returns chunks from the right collections
     based on the current conversation phase, pre-labelled for prompt injection

Collections managed here:
  souli_healing              — healing principles
  souli_activities_quick     — quick relief practices (under ~10 min)  ← NEW split
  souli_activities_deep      — deeper practices (10 min+)              ← NEW split
  souli_activities           — legacy / fallback (kept for old data)
  souli_stories              — metaphors, stories, signature phrases
  souli_commitment           — readiness challenge questions
  souli_patterns             — problem pattern descriptions

  souli_chunks_improved — general semantic collection (existing, managed by
                          qdrant_store_improved.py, just called from here)

Payload fields stored per chunk:
  text, chunk_type, energy_node, problem_keywords, source_video, youtube_url
  + for activity chunks: activity_name, duration_minutes, energy_type,
                         trigger_state, outcome
"""
from __future__ import annotations

import logging
import uuid
from typing import Any, Dict, List, Optional

import pandas as pd
from sentence_transformers import SentenceTransformer


logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

_DEFAULT_MODEL = "sentence-transformers/all-MiniLM-L6-v2"
_VECTOR_SIZE   = 384

_encoder_cache: dict = {}

# Payload field names — keep consistent across ingestion and retrieval
F_TEXT        = "text"
F_CHUNK_TYPE  = "chunk_type"
F_NODE        = "energy_node"
F_KEYWORDS    = "problem_keywords"
F_SOURCE      = "source_video"
F_URL         = "youtube_url"

# Activity-specific payload fields (only populated for activity chunks)
F_ACT_NAME    = "activity_name"
F_ACT_DURATION = "duration_minutes"
F_ACT_ENERGY_TYPE = "energy_type"       # "quick_relief" | "deeper_practice"
F_ACT_TRIGGER = "trigger_state"
F_ACT_OUTCOME = "outcome"

# ---------------------------------------------------------------------------
# Collection routing map
# chunk_type (str) → Qdrant collection name
# ---------------------------------------------------------------------------

COLLECTION_MAP: Dict[str, str] = {
    "healing":           "souli_healing",
    "activities":        "souli_activities",          # legacy — kept for backward compat
    "activities_quick":  "souli_activities_quick",    # NEW: quick relief (under ~10 min)
    "activities_deep":   "souli_activities_deep",     # NEW: deeper practices
    "stories":           "souli_stories",
    "commitment":        "souli_commitment",
    "patterns":          "souli_patterns",
}

# ---------------------------------------------------------------------------
# Phase → which typed collections to search
#
# souli_chunks_improved is always searched as a fallback by the engine itself —
# these are the TYPED collections to add on top, per phase.
#
# solution phase now hits quick first (person just agreed to try something),
# summary phase hits deep (wrapping up, suggesting ongoing practice).
# ---------------------------------------------------------------------------

_PHASE_COLLECTION_MAP: Dict[str, List[str]] = {
    "intake":       ["souli_patterns"],
    "sharing":      ["souli_stories", "souli_patterns"],
    "sharing_late": ["souli_healing", "souli_commitment"],
    "deepening":    ["souli_healing", "souli_commitment"],
    "solution":     ["souli_activities_quick", "souli_activities", "souli_healing"],
    "summary":      ["souli_activities_deep",  "souli_activities", "souli_healing"],
}

# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------

def _get_qdrant_client(host: str = "localhost", port: int = 6333):
    try:
        from qdrant_client import QdrantClient
        client = QdrantClient(host=host, port=port, timeout=8)
        client.get_collections()
        return client
    except Exception:
        logger.warning("Qdrant not reachable at %s:%s — using in-memory.", host, port)
        from qdrant_client import QdrantClient
        return QdrantClient(":memory:")


def _ensure_collection(client, collection: str):
    from qdrant_client.models import Distance, VectorParams
    existing = [c.name for c in client.get_collections().collections]
    if collection not in existing:
        client.create_collection(
            collection_name=collection,
            vectors_config=VectorParams(size=_VECTOR_SIZE, distance=Distance.COSINE),
        )
        logger.info("[MULTI] Created Qdrant collection '%s'", collection)


def _get_encoder(model_name: str):
    if model_name not in _encoder_cache:
        import os, sys
        old_stderr = sys.stderr
        sys.stderr = open(os.devnull, "w")
        try:
            _encoder_cache[model_name] = SentenceTransformer(model_name)
        finally:
            sys.stderr = old_stderr
    return _encoder_cache[model_name]


def _embed(texts: List[str], model_name: str) -> List[List[float]]:
    return _get_encoder(model_name).encode(
        texts, convert_to_numpy=True, show_progress_bar=False
    ).tolist()


def _content_uuid(text: str, source: str, chunk_type: str = "") -> str:
    """
    Deterministic UUID from content — prevents duplicates on re-ingest.
    chunk_type is included so the same text in healing vs activities gets different IDs.
    """
    key = f"{chunk_type}::{source}::{text[:400]}"
    return str(uuid.uuid5(uuid.NAMESPACE_DNS, key))


# ---------------------------------------------------------------------------
# Activity routing helper
# Decides whether an activity chunk goes to quick or deep collection.
# ---------------------------------------------------------------------------

def _resolve_activity_collection(chunk: Dict) -> str:
    """
    Route an activity chunk to the correct collection based on energy_type.

    Priority:
    1. energy_type field set by extractor  ("quick_relief" → quick, "deeper_practice" → deep)
    2. duration_minutes if energy_type missing (< 10 min → quick, 10+ → deep)
    3. Fall back to legacy souli_activities if both are absent
    """
    energy_type = (chunk.get("energy_type") or "").strip().lower()
    if energy_type == "quick_relief":
        return "souli_activities_quick"
    if energy_type == "deeper_practice":
        return "souli_activities_deep"

    # Try duration fallback
    duration = chunk.get("duration_minutes")
    if duration is not None:
        try:
            if int(duration) < 10:
                return "souli_activities_quick"
            else:
                return "souli_activities_deep"
        except (ValueError, TypeError):
            pass

    # Legacy fallback — old chunks without energy_type go here
    return "souli_activities"


# ---------------------------------------------------------------------------
# Single-collection typed ingest
# ---------------------------------------------------------------------------

def ingest_typed_chunks(
    chunks: List[Dict],
    chunk_type: str,
    embedding_model: str = _DEFAULT_MODEL,
    host: str = "localhost",
    port: int = 6333,
    batch_size: int = 32,
) -> int:
    """
    Ingest a list of extractor output dicts into the correct typed collection.

    For chunk_type == "activities", each chunk is routed individually to
    souli_activities_quick or souli_activities_deep based on its energy_type /
    duration_minutes field. The legacy souli_activities collection is used as
    a fallback for chunks missing both fields.

    Args:
        chunks:          Output of any extractor function — list of dicts with
                         keys: text, chunk_type, energy_node, problem_keywords,
                               source_video, youtube_url
                         Activity chunks also have: activity_name, duration_minutes,
                               energy_type, trigger_state, outcome
        chunk_type:      One of: healing, activities, activities_quick,
                         activities_deep, stories, commitment, patterns
        embedding_model: Sentence transformer model name
        host, port:      Qdrant server connection

    Returns:
        Total number of points successfully ingested across all target collections.
    """
    from qdrant_client.models import PointStruct

    # Filter out empty texts
    valid = [c for c in chunks if c.get("text", "").strip()]
    if not valid:
        logger.info("[MULTI] No valid chunks for type '%s' — nothing to ingest.", chunk_type)
        return 0

    # Drop exact text duplicates within this batch
    seen_texts: set = set()
    deduped = []
    for c in valid:
        t = c["text"].strip()
        if t not in seen_texts:
            seen_texts.add(t)
            deduped.append(c)

    if len(deduped) < len(valid):
        logger.info(
            "[MULTI] Dropped %d duplicate chunks for type '%s'.",
            len(valid) - len(deduped), chunk_type,
        )

    # ── For activities: route each chunk to its own collection ────────────
    if chunk_type == "activities":
        # Group chunks by their target collection
        collection_groups: Dict[str, List[Dict]] = {}
        for chunk in deduped:
            target = _resolve_activity_collection(chunk)
            collection_groups.setdefault(target, []).append(chunk)

        total_ingested = 0
        for collection, group_chunks in collection_groups.items():
            logger.info(
                "[MULTI:activities] Routing %d chunks → '%s'",
                len(group_chunks), collection,
            )
            total_ingested += _ingest_into_collection(
                chunks=group_chunks,
                chunk_type=chunk_type,
                collection=collection,
                embedding_model=embedding_model,
                host=host,
                port=port,
                batch_size=batch_size,
            )
        return total_ingested

    # ── For all other types: single fixed collection ──────────────────────
    if chunk_type not in COLLECTION_MAP:
        logger.error("[MULTI] Unknown chunk_type '%s' — skipping ingest.", chunk_type)
        return 0

    collection = COLLECTION_MAP[chunk_type]
    return _ingest_into_collection(
        chunks=deduped,
        chunk_type=chunk_type,
        collection=collection,
        embedding_model=embedding_model,
        host=host,
        port=port,
        batch_size=batch_size,
    )


def _ingest_into_collection(
    chunks: List[Dict],
    chunk_type: str,
    collection: str,
    embedding_model: str,
    host: str,
    port: int,
    batch_size: int = 32,
) -> int:
    """
    Internal: embed and upsert a list of chunks into a specific Qdrant collection.
    Builds a richer payload for activity chunks (includes activity_name, duration, etc.).
    """
    from qdrant_client.models import PointStruct

    client = _get_qdrant_client(host, port)
    _ensure_collection(client, collection)

    total    = len(chunks)
    ingested = 0

    for batch_start in range(0, total, batch_size):
        batch   = chunks[batch_start : batch_start + batch_size]
        texts   = [c["text"] for c in batch]
        vectors = _embed(texts, embedding_model)

        points = []
        for vec, chunk in zip(vectors, batch):
            source = chunk.get("source_video", "")

            # Base payload — all chunk types
            payload: Dict[str, Any] = {
                F_TEXT:       chunk.get("text", ""),
                F_CHUNK_TYPE: chunk_type,
                F_NODE:       chunk.get("energy_node", ""),
                F_KEYWORDS:   chunk.get("problem_keywords", ""),
                F_SOURCE:     source,
                F_URL:        chunk.get("youtube_url", ""),
            }

            # ── Activity-specific rich payload ────────────────────────────
            # These extra fields let the counselor build a much better prompt
            # (exact name, duration, when to use it, what user will feel after)
            if chunk_type == "activities":
                payload[F_ACT_NAME]        = chunk.get("activity_name", "")
                payload[F_ACT_DURATION]    = chunk.get("duration_minutes")   # int or None
                payload[F_ACT_ENERGY_TYPE] = chunk.get("energy_type", "")
                payload[F_ACT_TRIGGER]     = chunk.get("trigger_state", "")
                payload[F_ACT_OUTCOME]     = chunk.get("outcome", "")

            point_id = _content_uuid(payload[F_TEXT], source, chunk_type)
            points.append(PointStruct(id=point_id, vector=vec, payload=payload))

        client.upsert(collection_name=collection, points=points)
        ingested += len(points)
        logger.info(
            "[MULTI:%s] Ingested batch %d-%d / %d into '%s'",
            chunk_type, batch_start + 1, batch_start + len(batch), total, collection,
        )

    logger.info("[MULTI:%s] Total ingested: %d into '%s'", chunk_type, ingested, collection)
    return ingested


# ---------------------------------------------------------------------------
# Ingest all extractor outputs — the main entry point from the pipeline
# ---------------------------------------------------------------------------

def ingest_all_extractor_outputs(
    extractor_outputs: Dict[str, List[Dict]],
    embedding_model: str = _DEFAULT_MODEL,
    host: str = "localhost",
    port: int = 6333,
) -> Dict[str, int]:
    """
    Ingest all extractor outputs into their respective typed collections.

    Activities are automatically split into souli_activities_quick /
    souli_activities_deep based on the energy_type field set by the extractor.

    Args:
        extractor_outputs: Dict of chunk_type → list of chunk dicts.
                           Output of run_extractors_from_density().
                           Keys: healing, activities, stories, commitment, patterns

    Returns:
        Dict of chunk_type → count of ingested chunks
        e.g. {"healing": 12, "activities": 7, "stories": 8, "commitment": 5, "patterns": 11}
        Note: "activities" count is the total across quick + deep collections.
    """
    counts: Dict[str, int] = {}

    for chunk_type, chunks in extractor_outputs.items():
        # Allow activities even though it's not directly in COLLECTION_MAP
        # (it routes internally to quick/deep)
        if chunk_type not in COLLECTION_MAP and chunk_type != "activities":
            logger.warning(
                "[MULTI] Unknown chunk_type '%s' in extractor outputs — skipping.", chunk_type
            )
            continue

        count = ingest_typed_chunks(
            chunks=chunks,
            chunk_type=chunk_type,
            embedding_model=embedding_model,
            host=host,
            port=port,
        )
        counts[chunk_type] = count

    total = sum(counts.values())
    logger.info("[MULTI] Typed ingest complete. Counts: %s | Total: %d", counts, total)
    return counts


# ---------------------------------------------------------------------------
# Phase-aware retrieval — returns chunks labelled by type for prompt injection
# ---------------------------------------------------------------------------

def _get_collections_for_phase(phase: str, turn_count: int = 0) -> List[str]:
    """
    Return the list of typed collections to search for a given conversation phase.

    The 'sharing' phase is split: early turns use stories+patterns,
    later turns (5+) use healing+commitment to start moving forward.
    """
    if phase == "sharing" and turn_count >= 5:
        return _PHASE_COLLECTION_MAP.get("sharing_late", [])
    return _PHASE_COLLECTION_MAP.get(phase, _PHASE_COLLECTION_MAP["sharing"])


def query_by_phase(
    user_text: str,
    phase: str,
    energy_node: Optional[str] = None,
    turn_count: int = 0,
    top_k: int = 2,
    embedding_model: str = _DEFAULT_MODEL,
    host: str = "localhost",
    port: int = 6333,
    score_threshold: float = 0.25,
) -> List[Dict]:
    """
    Retrieve chunks from the typed collections appropriate for the current phase.

    Each returned chunk includes a 'chunk_type' field so the counselor prompt
    can inject it with the right label (e.g. [HEALING PRINCIPLE], [ACTIVITY]).

    Activity chunks now also carry: activity_name, duration_minutes, energy_type,
    trigger_state, outcome — so the counselor can build richer step-by-step prompts.

    Args:
        user_text:    Current user message (used as query vector)
        phase:        Current conversation phase (intake/sharing/deepening/solution/summary)
        energy_node:  Detected energy node (used as Qdrant filter)
        turn_count:   Current turn number (used to split early/late sharing)
        top_k:        How many chunks to retrieve PER collection
        embedding_model, host, port, score_threshold: standard Qdrant params

    Returns:
        List of chunk dicts, each with keys:
            text, chunk_type, energy_node, problem_keywords, source_video, score
            + for activity chunks: activity_name, duration_minutes, energy_type,
                                   trigger_state, outcome
    """
    from qdrant_client.models import Filter, FieldCondition, MatchValue

    if not user_text or not user_text.strip():
        return []

    collections_to_search = _get_collections_for_phase(phase, turn_count)
    if not collections_to_search:
        logger.info("[MULTI:retrieval] No typed collections for phase '%s'.", phase)
        return []

    client   = _get_qdrant_client(host, port)
    existing = {c.name for c in client.get_collections().collections}

    query_vec = _embed([user_text], embedding_model)[0]

    results: List[Dict] = []

    for collection in collections_to_search:
        if collection not in existing:
            logger.debug(
                "[MULTI:retrieval] Collection '%s' not found — skipping.", collection
            )
            continue

        # Build optional energy_node filter
        search_filter = None
        if energy_node:
            search_filter = Filter(
                must=[FieldCondition(key=F_NODE, match=MatchValue(value=energy_node))]
            )

        try:
            hits = client.search(
                collection_name=collection,
                query_vector=query_vec,
                query_filter=search_filter,
                limit=top_k,
                score_threshold=score_threshold,
            )
        except Exception as exc:
            logger.warning(
                "[MULTI:retrieval] Search failed in '%s': %s", collection, exc
            )
            continue

        for hit in hits:
            p = hit.payload or {}
            chunk: Dict[str, Any] = {
                "text":             p.get(F_TEXT, ""),
                "chunk_type":       p.get(F_CHUNK_TYPE, ""),
                "energy_node":      p.get(F_NODE, ""),
                "problem_keywords": p.get(F_KEYWORDS, ""),
                "source_video":     p.get(F_SOURCE, ""),
                "youtube_url":      p.get(F_URL, ""),
                "score":            hit.score,
            }

            # ── Pass through activity-specific fields if present ──────────
            # The counselor's _build_activity_steps_prompt uses these to build
            # a structured, coach-voice prompt instead of just dumping raw text.
            if p.get(F_ACT_NAME):
                chunk["activity_name"]    = p.get(F_ACT_NAME, "")
                chunk["duration_minutes"] = p.get(F_ACT_DURATION)
                chunk["energy_type"]      = p.get(F_ACT_ENERGY_TYPE, "")
                chunk["trigger_state"]    = p.get(F_ACT_TRIGGER, "")
                chunk["outcome"]          = p.get(F_ACT_OUTCOME, "")

            results.append(chunk)

        logger.debug(
            "[MULTI:retrieval] '%s' → %d hits (node=%s)", collection, len(hits), energy_node
        )

    # Deduplicate by text across collections (same chunk can appear in multiple)
    seen: set = set()
    unique_results = []
    for r in results:
        t = r["text"].strip()
        if t and t not in seen:
            seen.add(t)
            unique_results.append(r)

    # Sort by score descending so counselor gets best chunks first
    unique_results.sort(key=lambda x: x.get("score", 0), reverse=True)

    logger.info(
        "[MULTI:retrieval] Phase '%s' → %d unique chunks from %d collections",
        phase, len(unique_results), len(collections_to_search),
    )
    return unique_results