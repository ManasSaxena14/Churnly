"""
Retention knowledge retrieval.
===============================
Default backend: BM25 keyword search over the curated corpus — pure Python,
built in milliseconds, near-zero memory. With 66 short, keyword-dense
documents it retrieves as well as dense embeddings, and it keeps the API
inside the 512 MB free hosting tier (the ONNX embedding model alone costs
~160 MB and was getting the server OOM-killed during analyses).

RAG_BACKEND=embeddings switches to Chroma + MiniLM (app/rag/dense.py) on
machines with memory to spare. Either way retrieve() returns
[{id, text, source, topic, score}, …] and signal tags add a +0.05 boost.
"""

from __future__ import annotations

import math
import os
import re
import threading
from collections import Counter
from typing import Any

RAG_BACKEND = (os.getenv("RAG_BACKEND") or "lexical").strip().lower()

_TOKEN = re.compile(r"[a-z0-9]+")
_STOP = frozenset("""
a an and are as at be been but by can could did do does for from had has have how i if in into is it its
may more most not of on or our over per so such than that the their them then there these they this to
too up was we were what when which while who why will with within without you your
specific intervention interventions framework frameworks root cause causes pattern patterns industry
""".split())
_K1, _B = 1.4, 0.75


def _stem(t: str) -> str:
    for suf in ("ations", "ation", "ingly", "ing", "edly", "ed", "ies", "es", "s"):
        if len(t) > len(suf) + 3 and t.endswith(suf):
            return t[: -len(suf)] + ("y" if suf == "ies" else "")
    return t


def _tokens(text: str) -> list[str]:
    return [_stem(t) for t in _TOKEN.findall((text or "").lower()) if t not in _STOP and len(t) > 1]


class _Bm25:
    def __init__(self, corpus: list[dict[str, Any]]):
        self.docs = corpus
        self.tf: list[Counter] = []
        for c in corpus:
            meta = c.get("metadata") or {}
            # Title-like metadata counts double: it names what the chunk is about.
            fields = f"{c['text']} {meta.get('topic', '')} {meta.get('topic', '')} {meta.get('source', '')} " \
                     f"{str(meta.get('signals', '')).replace(',', ' ').replace('_', ' ')}"
            self.tf.append(Counter(_tokens(fields)))
        self.len = [sum(tf.values()) for tf in self.tf]
        self.avg = sum(self.len) / max(1, len(self.len))
        df: Counter = Counter()
        for tf in self.tf:
            df.update(tf.keys())
        n = len(corpus)
        self.idf = {t: math.log(1 + (n - d + 0.5) / (d + 0.5)) for t, d in df.items()}

    def scores(self, query: str) -> list[float]:
        q = Counter(_tokens(query))
        out = []
        for tf, dl in zip(self.tf, self.len):
            s = 0.0
            for t, qf in q.items():
                f = tf.get(t)
                if f:
                    s += self.idf[t] * f * (_K1 + 1) / (f + _K1 * (1 - _B + _B * dl / self.avg))
            out.append(s)
        return out


_index: _Bm25 | None = None
_index_lock = threading.Lock()


def _bm25() -> _Bm25:
    global _index
    if _index is None:
        with _index_lock:
            if _index is None:
                from app.rag.corpus_data import CORPUS

                _index = _Bm25(CORPUS)
    return _index


def _retrieve_lexical(query: str, k: int, signals: list[str] | None) -> list[dict[str, Any]]:
    idx = _bm25()
    raw = idx.scores(query)
    top = max(raw) if raw else 0.0
    wanted = {s.strip() for s in signals or []}
    chunks = []
    for doc, s in zip(idx.docs, raw):
        if s <= 0:
            continue
        meta = doc.get("metadata") or {}
        overlap = len(wanted & {x.strip() for x in str(meta.get("signals", "")).split(",")}) if wanted else 0
        chunks.append({
            "id": doc["id"],
            "text": doc["text"],
            "source": meta.get("source", "Unknown"),
            "topic": meta.get("topic", ""),
            # Relative relevance in [0, 1] (best match = 1) plus the signal boost.
            "score": round(s / top + overlap * 0.05, 4),
        })
    chunks.sort(key=lambda c: c["score"], reverse=True)
    return chunks[:k]


def retrieve(query: str, k: int = 5, signals: list[str] | None = None) -> list[dict[str, Any]]:
    """Top-k knowledge chunks for `query`, optionally boosted toward chunks
    tagged with any of `signals`. Never raises: retrieval failure → []."""
    try:
        if RAG_BACKEND == "embeddings":
            from app.rag import dense

            return dense.retrieve(query, k=k, signals=signals)
        return _retrieve_lexical(query, k, signals)
    except Exception as e:
        print(f"[RAG] retrieve() error: {e}")
        return []


def known_source_ids() -> frozenset[str]:
    """Ids of real knowledge-base documents — the only valid citations."""
    from app.rag.corpus_data import CORPUS

    return frozenset(c["id"] for c in CORPUS)


def valid_citations(ids: list[Any] | None) -> list[str]:
    """Keep only citations that point at an actual knowledge-base document
    (LLMs sometimes 'cite' made-up labels)."""
    known = known_source_ids()
    return sorted({str(i) for i in (ids or []) if str(i) in known})
