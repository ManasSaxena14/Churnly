"""
Build-time warm-up: python -m app.warmup
=========================================
Optional deploy build step (`pip install -r requirements.txt && python -m
app.warmup`). Checks the knowledge base answers queries, and with
RAG_BACKEND=embeddings also downloads the embedding model into the project
folder so a cold start has nothing to fetch.
"""

from __future__ import annotations

import time


def main() -> None:
    t0 = time.time()
    from app.rag.store import RAG_BACKEND, known_source_ids, retrieve

    hits = retrieve("customers on monthly contracts churn", k=1)
    print(f"[warmup] {RAG_BACKEND} retrieval over {len(known_source_ids())} docs ok={bool(hits)} ({time.time() - t0:.1f}s)", flush=True)
    if not hits:
        raise SystemExit("[warmup] knowledge base returned nothing — retrieval would silently fail")
    if RAG_BACKEND == "embeddings":
        import pathlib
        from app.rag.dense import _MODEL_DIR

        for archive in pathlib.Path(_MODEL_DIR).glob("*.tar.gz"):
            archive.unlink()  # only the unpacked model is needed at runtime


if __name__ == "__main__":
    main()
