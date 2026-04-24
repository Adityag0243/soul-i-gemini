"""
souli_pipeline/youtube/multi_data_ingestion_improved.py

Multi-collection ingestion pipeline — runs everything in one click.

Builds on pipeline_improved.py's core steps (Whisper → segment → clean)
and adds a parallel extraction layer that populates 7 Qdrant collections:

  souli_chunks_improved    — general semantic search (existing, reused)
  souli_healing            — healing principles
  souli_activities_quick   — quick relief practices (under ~10 min)  ← NEW
  souli_activities_deep    — deeper practices (10 min+)              ← NEW
  souli_activities         — legacy fallback for chunks without energy_type
  souli_stories            — metaphors, stories, signature phrases
  souli_commitment         — readiness challenge questions
  souli_patterns           — problem pattern descriptions

Flow:
  URL
  → Step 1: Whisper transcription          (existing: whisper_transcribe)
  → Step 2: Topic segment + clean          (existing: topic_segmenter + segment_cleaner)
  → Step 3: Persona extraction             (existing: persona_extractor)
  → Step 4: Energy node tagging            (existing: energy_tagger)
  → Step 5: General ingest                 (existing: qdrant_store_improved.ingest_improved_chunks)
  → Step 6: Content density detection      (NEW: content_density_detector)
  → Step 7: Multi-extractor run            (NEW: multi_extractors.run_extractors_from_density)
  → Step 8: Typed collection ingest        (NEW: qdrant_store_multi.ingest_all_extractor_outputs)

Outputs per video (in out_dir):
  whisper_segments.xlsx            — raw Whisper output
  paragraphs.xlsx                  — grouped paragraphs
  topic_segments.xlsx              — topic boundaries
  cleaned_chunks.xlsx              — LLM-cleaned prose per topic
  cleaned_chunks_tagged.xlsx       — with energy_node column
  density_report.json              — content density detection result
  extracted_healing.xlsx           — healing principle chunks
  extracted_activities.xlsx        — activity chunks (all, before split)
  extracted_activities_quick.xlsx  — quick relief activities only
  extracted_activities_deep.xlsx   — deeper practice activities only
  extracted_stories.xlsx           — story/phrase chunks
  extracted_commitment.xlsx        — commitment prompt chunks
  extracted_patterns.xlsx          — problem pattern chunks
  ingest_summary.json              — counts per collection

ZERO changes to pipeline_improved.py or any existing file.
"""
from __future__ import annotations

import json
import logging
import os
from typing import Dict, List, Optional

import pandas as pd

from souli_pipeline.config import PipelineConfig
from souli_pipeline.utils.logging import setup_logging

logger = setup_logging(__name__)


# ---------------------------------------------------------------------------
# Main entry point
# ---------------------------------------------------------------------------

def run_multi_ingestion_pipeline(
    cfg: PipelineConfig,
    youtube_url: str,
    out_dir: str,
    source_label: str = "",
    whisper_model: str = "medium",
    similarity_threshold: float = 0.45,
    min_topic_words: int = 80,
    max_topic_words: int = 600,
    num_ctx_processing: int = 8192,
    general_collection: str = "souli_chunks_improved",
    persona_path: str = "data/coach_persona.txt",
    skip_persona: bool = False,
    skip_ingest: bool = False,
) -> Dict[str, str]:
    """
    Run the full multi-collection ingestion pipeline for one YouTube video.

    Args:
        cfg:                 Loaded PipelineConfig
        youtube_url:         Full YouTube video URL
        out_dir:             Directory to save all output files
        source_label:        Human-readable label for this video (used in Qdrant payloads)
        whisper_model:       Whisper model size (tiny/base/small/medium/large)
        similarity_threshold: Topic boundary sensitivity — lower = more, smaller chunks
        min_topic_words:     Minimum words per topic segment
        max_topic_words:     Maximum words per topic segment
        num_ctx_processing:  Ollama context window for cleaning/extraction
        general_collection:  Name for the general souli_chunks_improved collection
        persona_path:        Path to the evolving coach persona file
        skip_persona:        Skip persona extraction (faster testing)
        skip_ingest:         Skip ALL Qdrant ingestion (produce files only)

    Returns:
        Dict of output_key → file_path (for display/logging)
    """
    os.makedirs(out_dir, exist_ok=True)
    c = cfg.conversation
    r = cfg.retrieval

    outputs: Dict[str, str] = {}

    # ------------------------------------------------------------------
    # Step 1 — Whisper transcription  (existing, unchanged)
    # ------------------------------------------------------------------
    logger.info("[MULTI] Step 1/8 — Whisper transcription: %s", youtube_url)
    from souli_pipeline.youtube.whisper_transcribe import transcribe_url

    segments = transcribe_url(
        url=youtube_url,
        out_dir=out_dir,
        whisper_model=whisper_model,
        language="en",
    )

    if not segments:
        logger.warning("[MULTI] No segments from Whisper — aborting for %s", youtube_url)
        return outputs

    df_segments = pd.DataFrame(segments)
    path_segments = os.path.join(out_dir, "whisper_segments.xlsx")
    df_segments.to_excel(path_segments, index=False)
    outputs["whisper_segments"] = path_segments
    logger.info("[MULTI] Whisper done: %d segments", len(df_segments))

    # ------------------------------------------------------------------
    # Step 2 — Topic segmentation + LLM cleaning  (existing, unchanged)
    # ------------------------------------------------------------------
    logger.info("[MULTI] Step 2/8 — Topic segmentation + cleaning...")
    from souli_pipeline.youtube.topic_segmenter import detect_topics
    from souli_pipeline.youtube.segment_cleaner import clean_all_segments

    paragraphs, topic_segments = detect_topics(
        segments=segments,
        similarity_threshold=similarity_threshold,
        min_topic_words=min_topic_words,
        max_topic_words=max_topic_words,
        embedding_model=r.embedding_model or "sentence-transformers/all-MiniLM-L6-v2",
    )

    # Save paragraphs
    df_paragraphs = pd.DataFrame([
        {"index": p.index, "start": p.start, "end": p.end,
         "text": p.text, "word_count": p.word_count}
        for p in paragraphs
    ])
    path_paragraphs = os.path.join(out_dir, "paragraphs.xlsx")
    df_paragraphs.to_excel(path_paragraphs, index=False)
    outputs["paragraphs"] = path_paragraphs

    # Save topic segments
    df_topics = pd.DataFrame([
        {"topic_index": t.topic_index, "start": t.start, "end": t.end,
         "word_count": t.word_count, "text": t.text}
        for t in topic_segments
    ])
    path_topics = os.path.join(out_dir, "topic_segments.xlsx")
    df_topics.to_excel(path_topics, index=False)
    outputs["topic_segments"] = path_topics

    logger.info(
        "[MULTI] %d topic segments from %d paragraphs", len(topic_segments), len(paragraphs)
    )

    if not topic_segments:
        logger.warning("[MULTI] No topic segments — aborting.")
        return outputs

    # Clean segments
    cleaned_chunks = clean_all_segments(
        topic_segments=topic_segments,
        ollama_model=c.chat_model,
        ollama_endpoint=c.ollama_endpoint,
        num_ctx=num_ctx_processing,
        temperature=0.3,
        max_workers=4,  
    )

    df_cleaned = pd.DataFrame(cleaned_chunks)
    path_cleaned = os.path.join(out_dir, "cleaned_chunks.xlsx")
    df_cleaned.to_excel(path_cleaned, index=False)
    outputs["cleaned_chunks"] = path_cleaned
    logger.info("[MULTI] Cleaning done: %d chunks", len(df_cleaned))

    # Build full transcript for extractors (join cleaned texts)
    text_col = "cleaned_text" if "cleaned_text" in df_cleaned.columns else "text"
    full_transcript = "\n\n".join(
        df_cleaned[text_col].dropna().astype(str).tolist()
    )

    # ------------------------------------------------------------------
    # Step 3 — Persona extraction  (existing, unchanged)
    # ------------------------------------------------------------------
    if not skip_persona:
        logger.info("[MULTI] Step 3/8 — Persona extraction...")
        try:
            from souli_pipeline.youtube.persona_extractor import extract_and_update_persona
            extract_and_update_persona(
                cleaned_chunks=cleaned_chunks,
                persona_path=persona_path,
                ollama_model=c.chat_model,
                ollama_endpoint=c.ollama_endpoint,
            )
            outputs["persona"] = persona_path
        except Exception as exc:
            logger.warning("[MULTI] Persona extraction failed: %s", exc)
    else:
        logger.info("[MULTI] Step 3/8 — Persona extraction skipped.")

    # ------------------------------------------------------------------
    # Step 4 — Energy node tagging  (existing, unchanged)
    # ------------------------------------------------------------------
    logger.info("[MULTI] Step 4/8 — Energy node tagging...")
    detected_node: Optional[str] = None

    try:
        from souli_pipeline.youtube.energy_tagger import tag_dataframe
        df_tagged = tag_dataframe(
            df=df_cleaned,
            text_col=text_col,
            ollama_model=c.tagger_model,
            ollama_endpoint=c.ollama_endpoint,
        )
        path_tagged = os.path.join(out_dir, "cleaned_chunks_tagged.xlsx")
        df_tagged.to_excel(path_tagged, index=False)
        outputs["cleaned_chunks_tagged"] = path_tagged

        # Most common node across all chunks = dominant node for this video
        if "energy_node" in df_tagged.columns:
            detected_node = df_tagged["energy_node"].mode().iloc[0]
            logger.info("[MULTI] Dominant energy node: %s", detected_node)
        df_cleaned = df_tagged
    except Exception as exc:
        logger.warning("[MULTI] Energy tagging failed: %s", exc)
        path_tagged = path_cleaned

    # ------------------------------------------------------------------
    # Step 5 — General ingest  (existing, unchanged)
    # ------------------------------------------------------------------
    n_general = 0

    if not skip_ingest:
        logger.info("[MULTI] Step 5/8 — General ingest → '%s'...", general_collection)
        try:
            from souli_pipeline.retrieval.qdrant_store_improved import ingest_improved_chunks
            df_for_ingest = df_cleaned.copy()
            df_for_ingest["source_video"] = source_label or youtube_url
            df_for_ingest["youtube_url"]  = youtube_url

            n_general = ingest_improved_chunks(
                df=df_for_ingest,
                collection=general_collection,
                embedding_model=r.embedding_model or "sentence-transformers/all-MiniLM-L6-v2",
                host=r.qdrant_host,
                port=r.qdrant_port,
            )
            logger.info("[MULTI] General ingest done: %d chunks → '%s'", n_general, general_collection)
        except Exception as exc:
            logger.warning("[MULTI] General ingest failed: %s", exc)
    else:
        logger.info("[MULTI] Step 5/8 — General ingest skipped (skip_ingest=True).")

    # ------------------------------------------------------------------
    # Step 6 — Content density detection  (NEW)
    # ------------------------------------------------------------------
    logger.info("[MULTI] Step 6/8 — Content density detection...")
    from souli_pipeline.youtube.content_density_detector import detect_content_density

    density_report = detect_content_density(
        transcript=full_transcript,
        energy_node=detected_node,
        ollama_model=c.chat_model,
        ollama_endpoint=c.ollama_endpoint,
    )

    density_path = os.path.join(out_dir, "density_report.json")
    with open(density_path, "w", encoding="utf-8") as f:
        json.dump(density_report, f, indent=2)
    outputs["density_report"] = density_path

    logger.info(
        "[MULTI] Density: healing=%s activity=%s story=%s commitment=%s pattern=%s node=%s",
        density_report["healing_rich"], density_report["activity_rich"],
        density_report["story_rich"],   density_report["commitment_rich"],
        density_report["pattern_rich"], density_report["dominant_node"],
    )

    # Use density report's node if we didn't get one from tagging
    if not detected_node:
        detected_node = density_report.get("dominant_node", "blocked_energy")

    # ------------------------------------------------------------------
    # Step 7 — Multi-extractor run  (NEW)
    # ------------------------------------------------------------------
    logger.info("[MULTI] Step 7/8 — Running typed extractors...")
    from souli_pipeline.youtube.multi_extractors import run_extractors_from_density

    extractor_outputs = run_extractors_from_density(
        transcript=full_transcript,
        energy_node=detected_node,
        density_report=density_report,
        ollama_model=c.chat_model,
        ollama_endpoint=c.ollama_endpoint,
    )

    # ── Re-tag each extracted chunk with energy_tagger (Qwen) ──────────────
    # The extractor stamps all chunks with one fixed detected_node.
    # We now run each chunk's text through energy_tagger so every chunk
    # gets its own accurate node based on actual content.
    try:
        from souli_pipeline.youtube.energy_tagger import tag_chunk
        logger.info("[MULTI] Re-tagging extracted chunks with Qwen energy_tagger...")
        for chunk_type, chunks in extractor_outputs.items():
            for chunk in chunks:
                text = chunk.get("text", "").strip()
                if text:
                    result = tag_chunk(
                        text,
                        ollama_model=c.tagger_model,
                        ollama_endpoint=c.ollama_endpoint,
                    )
                    chunk["energy_node"] = result["energy_node"]
                    chunk["energy_node_reason"] = result["reason"]
        logger.info("[MULTI] Re-tagging done.")
    except Exception as exc:
        logger.warning("[MULTI] Re-tagging failed (%s) — keeping extractor-assigned nodes.", exc)

    # Stamp source info onto every chunk
    for chunk_type, chunks in extractor_outputs.items():
        for chunk in chunks:
            chunk["source_video"] = source_label or youtube_url
            chunk["youtube_url"]  = youtube_url

    # ------------------------------------------------------------------
    # Save extractor outputs to Excel
    # All activities go to extracted_activities.xlsx (full view).
    # Quick and deep are also saved as separate files for inspection.
    # ------------------------------------------------------------------
    extractor_excels: Dict[str, str] = {}

    for chunk_type, chunks in extractor_outputs.items():
        if chunks:
            df_ext  = pd.DataFrame(chunks)
            ext_path = os.path.join(out_dir, f"extracted_{chunk_type}.xlsx")
            df_ext.to_excel(ext_path, index=False)
            extractor_excels[chunk_type] = ext_path
            outputs[f"extracted_{chunk_type}"] = ext_path
            logger.info(
                "[MULTI] Saved %d %s chunks → %s", len(chunks), chunk_type, ext_path
            )

            # ── Extra split files for activities ─────────────────────────
            # Makes it easy to inspect in Streamlit which went quick vs deep.
            if chunk_type == "activities":
                quick_chunks = [
                    c for c in chunks
                    if c.get("energy_type") == "quick_relief"
                    or (c.get("duration_minutes") is not None and int(c.get("duration_minutes", 99)) < 10)
                ]
                deep_chunks = [
                    c for c in chunks
                    if c.get("energy_type") == "deeper_practice"
                    or (c.get("duration_minutes") is not None and int(c.get("duration_minutes", 0)) >= 10)
                ]
                # Chunks with no energy_type and no duration stay in the main file only

                if quick_chunks:
                    df_quick = pd.DataFrame(quick_chunks)
                    quick_path = os.path.join(out_dir, "extracted_activities_quick.xlsx")
                    df_quick.to_excel(quick_path, index=False)
                    outputs["extracted_activities_quick"] = quick_path
                    logger.info(
                        "[MULTI] Saved %d quick activity chunks → %s", len(quick_chunks), quick_path
                    )

                if deep_chunks:
                    df_deep = pd.DataFrame(deep_chunks)
                    deep_path = os.path.join(out_dir, "extracted_activities_deep.xlsx")
                    df_deep.to_excel(deep_path, index=False)
                    outputs["extracted_activities_deep"] = deep_path
                    logger.info(
                        "[MULTI] Saved %d deep activity chunks → %s", len(deep_chunks), deep_path
                    )
        else:
            logger.info("[MULTI] No %s chunks extracted (skipped or empty).", chunk_type)

    # ------------------------------------------------------------------
    # Step 8 — Typed collection ingest  (NEW)
    # Activities are automatically routed to souli_activities_quick /
    # souli_activities_deep inside ingest_all_extractor_outputs.
    # ------------------------------------------------------------------
    ingest_summary: Dict[str, int] = {"general": n_general}

    if not skip_ingest:
        logger.info("[MULTI] Step 8/8 — Typed collection ingest...")
        from souli_pipeline.retrieval.qdrant_store_multi import ingest_all_extractor_outputs

        typed_counts = ingest_all_extractor_outputs(
            extractor_outputs=extractor_outputs,
            embedding_model=r.embedding_model or "sentence-transformers/all-MiniLM-L6-v2",
            host=r.qdrant_host,
            port=r.qdrant_port,
        )
        ingest_summary.update(typed_counts)
        logger.info("[MULTI] Typed ingest done: %s", typed_counts)
    else:
        logger.info("[MULTI] Step 8/8 — Typed ingest skipped (skip_ingest=True).")

    # Save ingest summary
    summary_path = os.path.join(out_dir, "ingest_summary.json")
    with open(summary_path, "w", encoding="utf-8") as f:
        json.dump(ingest_summary, f, indent=2)
    outputs["ingest_summary"] = summary_path

    total_ingested = sum(ingest_summary.values())
    logger.info(
        "[MULTI] Pipeline complete. Collections: %s | Total chunks: %d",
        ingest_summary, total_ingested,
    )

    return outputs