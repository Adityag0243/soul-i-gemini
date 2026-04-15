"""
cleanup_healing_collection.py

Does 3 things to your souli_healing Qdrant collection:
  1. Pulls all points out
  2. Removes duplicates (exact + near-duplicate by similarity)
  3. Re-tags energy_node based on the text content (blocked/depleted/scattered/normal)

Run from your project root:
    python cleanup_healing_collection.py

Requirements: qdrant-client, sentence-transformers
Both are already installed in your souli_pipeline environment.
"""

from qdrant_client import QdrantClient
from qdrant_client.models import PointStruct, Filter, FieldCondition, MatchValue
import uuid, json

# ---------------------------------------------------------------------------
# CONFIG — change these if your setup is different
# ---------------------------------------------------------------------------
QDRANT_HOST  = "localhost"
QDRANT_PORT  = 6333
COLLECTION   = "souli_healing"
# Similarity threshold: two texts above this % are considered duplicates
# 0.92 = very strict (near-identical), lower = more aggressive dedup
DEDUP_THRESHOLD = 0.92
# ---------------------------------------------------------------------------

# ── Keywords that signal each energy node ──────────────────────────────────
# These are based on your gold framework typical_signs + your problem_keywords
NODE_KEYWORDS = {
    "blocked_energy": [
        "blocked", "stuck", "withdrawal", "depression", "isolated", "trapped",
        "bleeding", "red zone", "survival", "cycle", "freeze", "numb",
        "emotional attack", "procrastin", "toxic pattern", "self harm",
        "can't move", "disconnected", "unfreedom", "compulsion", "occupied",
        "fear of death", "attachment to life", "rebirth", "unfinished",
        "past", "ghost", "letting go", "stagnation", "stillness keeps you stuck",
        "emotional blockage", "negativity", "resistance", "victim",
    ],
    "depleted_energy": [
        "depleted", "exhausted", "tired", "lazy", "no energy", "burnout",
        "impress", "not enough", "self-doubt", "low self-esteem", "unfair",
        "nobody values", "feel used", "digestion", "slow", "recovery",
        "liver", "nutrients", "physically weak",
    ],
    "scattered_energy": [
        "scattered", "anxious", "stress", "overwhelm", "overwork", "burnout",
        "overburdened", "cannot focus", "distracted", "mental clutter",
        "overanalys", "too much", "all over", "chaotic", "scattered",
        "outofcontrol", "panic",
    ],
    "outofcontrol_energy": [
        "outofcontrol", "out of control", "panic", "anxiety loop",
        "overthink", "control pattern", "fear of uncertainty",
        "analysis paralysis", "mental exhaustion",
    ],
}

# Points that match NONE of the above stay as normal_energy
VALID_NODES = list(NODE_KEYWORDS.keys()) + ["normal_energy"]


def retag_node(text: str, keywords: str) -> str:
    """
    Decide the energy_node for a point based on its text + problem_keywords.
    Returns the most specific node that matches, or normal_energy.
    """
    combined = (text + " " + keywords).lower()

    # Score each node by how many keywords hit
    scores = {}
    for node, kw_list in NODE_KEYWORDS.items():
        score = sum(1 for kw in kw_list if kw in combined)
        if score > 0:
            scores[node] = score

    if not scores:
        return "normal_energy"

    # Return the node with the highest keyword hit count
    return max(scores, key=scores.get)


def cosine_sim(a, b):
    """Simple cosine similarity between two vectors."""
    dot = sum(x * y for x, y in zip(a, b))
    na  = sum(x * x for x in a) ** 0.5
    nb  = sum(x * x for x in b) ** 0.5
    if na == 0 or nb == 0:
        return 0.0
    return dot / (na * nb)


def embed_texts(texts):
    """Embed a list of texts using sentence-transformers."""
    from sentence_transformers import SentenceTransformer
    model = SentenceTransformer("sentence-transformers/all-MiniLM-L6-v2")
    return model.encode(texts, convert_to_numpy=True, show_progress_bar=False).tolist()


def scroll_all_points(client, collection):
    """Fetch ALL points from a Qdrant collection (handles pagination)."""
    all_points = []
    offset = None

    while True:
        result = client.scroll(
            collection_name=collection,
            limit=100,
            offset=offset,
            with_payload=True,
            with_vectors=True,   # need vectors to rebuild points on upsert
        )
        points, next_offset = result
        all_points.extend(points)
        if next_offset is None:
            break
        offset = next_offset

    return all_points


def dedup_by_similarity(points, threshold=DEDUP_THRESHOLD):
    """
    Remove near-duplicate points.
    Strategy:
      - First remove exact text duplicates (keep first occurrence)
      - Then remove near-duplicates using cosine similarity on stored vectors
    Returns the cleaned list of points.
    """
    # Step 1: exact text dedup
    seen_texts = set()
    unique = []
    exact_removed = 0
    for p in points:
        text = (p.payload.get("text") or "").strip().lower()
        if text in seen_texts:
            exact_removed += 1
            continue
        seen_texts.add(text)
        unique.append(p)

    print(f"  Exact duplicates removed: {exact_removed}")

    # Step 2: near-duplicate dedup using stored vectors
    kept = []
    kept_vectors = []
    near_removed = 0

    for p in unique:
        vec = p.vector  # already stored in Qdrant, no need to re-embed
        if vec is None:
            # No vector stored, keep the point
            kept.append(p)
            continue

        # Check similarity against all kept vectors
        is_dup = False
        for kv in kept_vectors:
            if cosine_sim(vec, kv) >= threshold:
                is_dup = True
                break

        if is_dup:
            near_removed += 1
        else:
            kept.append(p)
            kept_vectors.append(vec)

    print(f"  Near-duplicate removed (>{threshold:.0%} similar): {near_removed}")
    print(f"  Points remaining after dedup: {len(kept)}")
    return kept


def retag_all(points):
    """
    Re-assign energy_node for every point based on text + keywords.
    Returns list of (point, old_node, new_node) tuples.
    """
    changes = []
    for p in points:
        text     = p.payload.get("text", "")
        keywords = p.payload.get("problem_keywords", "")
        old_node = p.payload.get("energy_node", "")
        new_node = retag_node(text, keywords)
        changes.append((p, old_node, new_node))
    return changes


def flag_offtopic(points):
    """
    Flag points that don't look like healing principles at all.
    A healing principle should be a belief or truth that helps someone heal.
    Returns (good_points, flagged_points).
    """
    # Phrases that indicate non-healing content
    OFFTOPIC_SIGNALS = [
        "liver is working", "nutrients", "medications for a couple",
        "stopped taking them all at once", "training",
        "glowing with the light on your skin",  # too vague/cosmetic
    ]

    good, flagged = [], []
    for p in points:
        text = (p.payload.get("text") or "").lower()
        is_offtopic = any(sig.lower() in text for sig in OFFTOPIC_SIGNALS)
        if is_offtopic:
            flagged.append(p)
        else:
            good.append(p)

    return good, flagged


def main():
    print("=" * 60)
    print("Souli Healing Collection Cleanup")
    print("=" * 60)

    # ── Connect ──────────────────────────────────────────────────
    print(f"\nConnecting to Qdrant at {QDRANT_HOST}:{QDRANT_PORT}...")
    client = QdrantClient(host=QDRANT_HOST, port=QDRANT_PORT, timeout=10)
    collections = [c.name for c in client.get_collections().collections]
    if COLLECTION not in collections:
        print(f"ERROR: Collection '{COLLECTION}' not found!")
        print(f"Available collections: {collections}")
        return

    # ── Fetch all points ─────────────────────────────────────────
    print(f"\nFetching all points from '{COLLECTION}'...")
    all_points = scroll_all_points(client, COLLECTION)
    print(f"  Total points fetched: {len(all_points)}")

    # ── Step 1: Remove off-topic ──────────────────────────────────
    print("\nStep 1 — Removing off-topic points...")
    good_points, flagged = flag_offtopic(all_points)
    print(f"  Off-topic removed: {len(flagged)}")
    for p in flagged:
        print(f"    REMOVED: {p.payload.get('text', '')[:80]}")

    # ── Step 2: Dedup ─────────────────────────────────────────────
    print("\nStep 2 — Deduplicating...")
    clean_points = dedup_by_similarity(good_points)

    # ── Step 3: Retag nodes ───────────────────────────────────────
    print("\nStep 3 — Re-tagging energy_node...")
    tagged = retag_all(clean_points)

    node_counts = {}
    changed_count = 0
    for p, old, new in tagged:
        node_counts[new] = node_counts.get(new, 0) + 1
        if old != new:
            changed_count += 1
            print(f"  RETAGGED: '{p.payload.get('text','')[:60]}...'")
            print(f"    {old} → {new}")

    print(f"\n  Tags changed: {changed_count}")
    print(f"  Final node distribution:")
    for node, count in sorted(node_counts.items()):
        print(f"    {node}: {count}")

    # ── Preview before writing ────────────────────────────────────
    print(f"\nSummary:")
    print(f"  Original points : {len(all_points)}")
    print(f"  After cleanup   : {len(clean_points)}")
    print(f"  Removed total   : {len(all_points) - len(clean_points)}")

    confirm = input("\nWrite cleaned data back to Qdrant? (yes/no): ").strip().lower()
    if confirm != "yes":
        print("Aborted. Nothing was written.")
        return

    # ── Delete collection and re-ingest clean data ────────────────
    print("\nDeleting old collection...")
    client.delete_collection(COLLECTION)

    print("Re-creating collection...")
    from qdrant_client.models import Distance, VectorParams
    client.create_collection(
        collection_name=COLLECTION,
        vectors_config=VectorParams(size=384, distance=Distance.COSINE),
    )

    print("Upserting clean points...")
    # Build updated PointStructs with new node tags
    new_points = []
    for p, old_node, new_node in tagged:
        updated_payload = dict(p.payload)
        updated_payload["energy_node"] = new_node
        # Reuse same ID and vector — just update payload
        new_points.append(
            PointStruct(id=p.id, vector=p.vector, payload=updated_payload)
        )

    # Upsert in batches of 50
    for i in range(0, len(new_points), 50):
        batch = new_points[i:i+50]
        client.upsert(collection_name=COLLECTION, points=batch)

    print(f"\nDone! '{COLLECTION}' now has {len(new_points)} clean points.")
    print("Node distribution after cleanup:")
    for node, count in sorted(node_counts.items()):
        bar = "█" * count
        print(f"  {node:<30} {bar} ({count})")


if __name__ == "__main__":
    main()
