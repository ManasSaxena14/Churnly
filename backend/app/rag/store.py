"""
Chroma-backed retention knowledge retrieval.
"""

from __future__ import annotations

import os
import threading
from typing import Any
import chromadb
from chromadb.config import Settings

_PERSIST_DIR = os.path.join(os.path.dirname(__file__), "chroma_db")
_COLLECTION_NAME = "retention_knowledge"

_client = None
_collection = None
_seed_lock = threading.Lock()


def get_client():
    global _client
    if _client is None:
        _client = chromadb.PersistentClient(
            path=_PERSIST_DIR,
            settings=Settings(anonymized_telemetry=False),
        )
    return _client


def get_collection():
    """Get or create the collection. Uses Chroma's default all-MiniLM embedder."""
    global _collection
    if _collection is None:
        client = get_client()
        _collection = client.get_or_create_collection(
            name=_COLLECTION_NAME,
            metadata={"hnsw:space": "cosine"},
        )
        _ensure_corpus(_collection)
    return _collection


def _ensure_corpus(col) -> None:
    """The vector store isn't committed to git, so a fresh clone or a new
    server starts with it empty — and every retrieval would silently return
    nothing. Load the bundled corpus whenever the store doesn't match it."""
    from app.rag.corpus_data import CORPUS

    with _seed_lock:
        if col.count() == len(CORPUS):
            return
        existing = col.get(include=[]).get("ids") or []
        if existing:
            col.delete(ids=existing)
        col.add(
            ids=[c["id"] for c in CORPUS],
            documents=[c["text"] for c in CORPUS],
            metadatas=[c["metadata"] for c in CORPUS],
        )
        print(f"[RAG] Loaded {len(CORPUS)} knowledge-base chunks into '{col.name}'", flush=True)


def known_source_ids() -> frozenset[str]:
    """Ids of real knowledge-base documents — the only valid citations."""
    from app.rag.corpus_data import CORPUS

    return frozenset(c["id"] for c in CORPUS)


def valid_citations(ids: list[Any] | None) -> list[str]:
    """Keep only citations that point at an actual knowledge-base document
    (LLMs sometimes 'cite' made-up labels)."""
    known = known_source_ids()
    return sorted({str(i) for i in (ids or []) if str(i) in known})


def retrieve(query: str, k: int = 5, signals: list[str] | None = None) -> list[dict[str, Any]]:
    """
    Retrieve top-k chunks for a query. Optionally bias toward chunks whose
    `signals` metadata contains any of the provided signals.
    Returns: [{id, text, source, topic, score}, ...]
    """
    try:
        col = get_collection()
        if col.count() == 0:
            return []

        results = col.query(query_texts=[query], n_results=k)
        ids = results.get("ids", [[]])[0]
        docs = results.get("documents", [[]])[0]
        metas = results.get("metadatas", [[]])[0]
        dists = results.get("distances", [[]])[0]

        chunks = []
        for i, doc in enumerate(docs):
            meta = metas[i] or {}
            chunk_signals = (meta.get("signals") or "").split(",")
            signal_boost = 0.0
            if signals:
                overlap = len(set(s.strip() for s in chunk_signals) & set(signals))
                signal_boost = overlap * 0.05
            # Chroma cosine distance: 0 = identical, 2 = opposite. Convert to similarity.
            base_score = 1.0 - (dists[i] / 2.0)
            chunks.append({
                "id": ids[i],
                "text": doc,
                "source": meta.get("source", "Unknown"),
                "topic": meta.get("topic", ""),
                "score": round(base_score + signal_boost, 4),
            })

        chunks.sort(key=lambda c: c["score"], reverse=True)
        return chunks
    except Exception as e:
        print(f"[RAG] retrieve() error: {e}")
        return []


def reset_collection():
    """Drop and recreate the collection. Used by the ingest script."""
    global _collection
    client = get_client()
    try:
        client.delete_collection(_COLLECTION_NAME)
    except Exception:
        pass
    _collection = None
    return get_collection()
