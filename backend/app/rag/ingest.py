"""
One-time script to load corpus_data.CORPUS into Chroma.
Run from backend/: python -m app.rag.ingest
"""

from app.rag.corpus_data import CORPUS
from app.rag.store import reset_collection


def ingest():
    col = reset_collection()
    col.add(
        ids=[c["id"] for c in CORPUS],
        documents=[c["text"] for c in CORPUS],
        metadatas=[c["metadata"] for c in CORPUS],
    )
    print(f"[RAG] Ingested {len(CORPUS)} chunks into '{col.name}'. Total: {col.count()}")


if __name__ == "__main__":
    ingest()
