"""
Build-time warm-up: python -m app.warmup
=========================================
Run as part of the deploy build (Render build command:
`pip install -r requirements.txt && python -m app.warmup`). Downloads the
embedding model into the project folder and loads the knowledge base, so a
cold start has nothing to download and the server boots in seconds.
"""

from __future__ import annotations

import time


def main() -> None:
    t0 = time.time()
    from app.rag.store import get_collection, retrieve

    count = get_collection().count()
    hits = retrieve("customers on monthly contracts churn", k=1)
    print(f"[warmup] knowledge base: {count} chunks, test search ok={bool(hits)} ({time.time() - t0:.1f}s)", flush=True)
    if not count or not hits:
        raise SystemExit("[warmup] knowledge base is empty — retrieval would silently fail")
    # Only the unpacked model is needed at runtime; drop the 80 MB archive.
    import pathlib
    from app.rag.store import _MODEL_DIR

    for archive in pathlib.Path(_MODEL_DIR).glob("*.tar.gz"):
        archive.unlink()



if __name__ == "__main__":
    main()
