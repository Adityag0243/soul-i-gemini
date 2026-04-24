"""
scripts/reingest_activities.py

Re-extracts and re-ingests activities from all previously processed videos.
Uses existing cleaned_chunks_tagged.xlsx files — NO re-transcription needed.

Usage:
    python -m souli_pipeline.scripts.reingest_activities \
        --outputs-dir outputs \
        --config config/pipeline.yaml \
        --ollama-model llama3.1 \
        --dry-run          # optional: just show what would happen, don't push to Qdrant

What it does:
    1. Finds all cleaned_chunks_tagged.xlsx files in your outputs/ folder
    2. Re-runs the improved activity extractor on each one
    3. Wipes the current souli_activities Qdrant collection
    4. Pushes all new activity chunks fresh
"""
from __future__ import annotations

import argparse
import logging
import os
import sys

import pandas as pd

logging.basicConfig(level=logging.INFO, format="%(levelname)s %(name)s — %(message)s")
logger = logging.getLogger("reingest_activities")


def find_all_cleaned_chunks(outputs_dir: str) -> list[str]:
    """Walk the outputs directory and find all cleaned_chunks_tagged.xlsx files."""
    found = []
    for root, dirs, files in os.walk(outputs_dir):
        for f in files:
            if f == "cleaned_chunks_tagged.xlsx":
                found.append(os.path.join(root, f))
    found.sort()
    logger.info("Found %d cleaned_chunks_tagged.xlsx files", len(found))
    return found


def extract_activities_from_file(
    xlsx_path: str,
    ollama_model: str,
    ollama_endpoint: str,
) -> list[dict]:
    """Read one cleaned_chunks_tagged.xlsx and run activity extraction on it."""
    try:
        df = pd.read_excel(xlsx_path)
    except Exception as e:
        logger.warning("Could not read %s: %s", xlsx_path, e)
        return []

    # The text column is called cleaned_text in the improved pipeline
    text_col = "cleaned_text" if "cleaned_text" in df.columns else "text"
    if text_col not in df.columns:
        logger.warning("No text column found in %s — skipping", xlsx_path)
        return []

    # Join all chunks into one transcript for the extractor
    transcript = "\n\n".join(df[text_col].dropna().astype(str).tolist())

    if len(transcript.strip()) < 100:
        logger.warning("Transcript too short in %s — skipping", xlsx_path)
        return []

    # Get the dominant energy node from the file
    energy_node = "scattered_energy"  # safe default
    if "energy_node" in df.columns:
        node_counts = df["energy_node"].value_counts()
        if not node_counts.empty:
            energy_node = node_counts.index[0]

    # Get source info if available
    source_video = ""
    youtube_url = ""
    if "source_video" in df.columns:
        source_video = str(df["source_video"].iloc[0]) if not df["source_video"].isna().all() else ""
    if "youtube_url" in df.columns:
        youtube_url = str(df["youtube_url"].iloc[0]) if not df["youtube_url"].isna().all() else ""

    # If source info missing, use the folder name as source label
    if not source_video:
        source_video = os.path.basename(os.path.dirname(xlsx_path))

    logger.info(
        "Extracting from: %s | node: %s | ~%d words",
        source_video, energy_node, len(transcript.split())
    )

    from souli_pipeline.youtube.multi_extractors import extract_activities

    chunks = extract_activities(
        transcript=transcript,
        energy_node=energy_node,
        ollama_model=ollama_model,
        ollama_endpoint=ollama_endpoint,
    )

    # Stamp source info onto each chunk
    for c in chunks:
        c["source_video"] = source_video
        c["youtube_url"] = youtube_url

    logger.info("  → Extracted %d activity chunks from %s", len(chunks), source_video)
    return chunks


def wipe_activities_collection(host: str, port: int, dry_run: bool):
    """Delete and recreate the souli_activities collection."""
    if dry_run:
        logger.info("[DRY RUN] Would wipe souli_activities collection")
        return

    try:
        from qdrant_client import QdrantClient
        client = QdrantClient(host=host, port=port, timeout=10)
        collections = {c.name for c in client.get_collections().collections}
        if "souli_activities" in collections:
            client.delete_collection("souli_activities")
            logger.info("Deleted souli_activities collection")
        else:
            logger.info("souli_activities collection doesn't exist yet — will be created fresh")
    except Exception as e:
        logger.error("Could not connect to Qdrant at %s:%d — %s", host, port, e)
        sys.exit(1)


def main():
    parser = argparse.ArgumentParser(description="Re-ingest activities from existing cleaned chunks")
    parser.add_argument("--outputs-dir", default="outputs", help="Path to your outputs/ folder")
    parser.add_argument("--ollama-model", default="llama3.1")
    parser.add_argument("--ollama-endpoint", default="http://localhost:11434")
    parser.add_argument("--qdrant-host", default="localhost")
    parser.add_argument("--qdrant-port", type=int, default=6333)
    parser.add_argument("--dry-run", action="store_true", help="Extract but don't push to Qdrant")
    args = parser.parse_args()

    # Step 1: Find all cleaned chunk files
    xlsx_files = find_all_cleaned_chunks(args.outputs_dir)
    if not xlsx_files:
        logger.error("No cleaned_chunks_tagged.xlsx files found in %s", args.outputs_dir)
        sys.exit(1)

    # Step 2: Extract activities from each file
    all_chunks = []
    for xlsx_path in xlsx_files:
        chunks = extract_activities_from_file(
            xlsx_path=xlsx_path,
            ollama_model=args.ollama_model,
            ollama_endpoint=args.ollama_endpoint,
        )
        all_chunks.extend(chunks)

    logger.info("Total activity chunks extracted: %d from %d files", len(all_chunks), len(xlsx_files))

    if not all_chunks:
        logger.warning("No activity chunks extracted — nothing to ingest")
        sys.exit(0)

    # Step 3: Show summary before pushing
    from collections import Counter
    node_counts = Counter(c.get("energy_node", "unknown") for c in all_chunks)
    relief_counts = Counter(c.get("relief_type", "unspecified") for c in all_chunks)
    logger.info("By energy node: %s", dict(node_counts))
    logger.info("By relief type: %s", dict(relief_counts))

    if args.dry_run:
        logger.info("[DRY RUN] Would ingest %d chunks. First 3 samples:", len(all_chunks))
        for c in all_chunks[:3]:
            logger.info("  --- SAMPLE ---")
            logger.info("  text: %s", c.get("text", "")[:150])
            logger.info("  duration: %s | relief_type: %s", c.get("duration"), c.get("relief_type"))
            logger.info("  outcome: %s", c.get("expected_outcome", "")[:100])
        return

    # Step 4: Wipe old collection
    wipe_activities_collection(args.qdrant_host, args.qdrant_port, dry_run=False)

    # Step 5: Push all new chunks
    from souli_pipeline.retrieval.qdrant_store_multi import ingest_typed_chunks
    count = ingest_typed_chunks(
        chunks=all_chunks,
        chunk_type="activities",
        host=args.qdrant_host,
        port=args.qdrant_port,
    )
    logger.info("✅ Done! Ingested %d activity chunks into souli_activities", count)


if __name__ == "__main__":
    main()