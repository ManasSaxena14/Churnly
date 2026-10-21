"""
Chroma-backed retention knowledge retrieval.
"""

from __future__ import annotations

import os
from typing import Any
import chromadb
from chromadb.config import Settings

_PERSIST_DIR = os.path.join(os.path.dirname(__file__), "chroma_db")
_COLLECTION_NAME = "retention_knowledge"

_client = None
_collection = None


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
    return _collection


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
