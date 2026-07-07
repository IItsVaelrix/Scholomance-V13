#!/usr/bin/env python3
"""
substrate_engine.py — The Brain-Boosting Microchip Memory Bank
===============================================================
A Turboquant-style 4-bit quantized vector memory substrate.
Zero external dependencies (pure Python stdlib).

Concept:
  The substrate stores compressed vector memories (knowledge, personality,
  procedural patterns) that a small 1B model can query at inference time.
  Like a "brain boosting microchip" — the model doesn't need to memorize
  facts in its weights; it reads them from the substrate on demand.

Design:
  - 4-bit scalar quantization packs 2 floats per byte → 8x compression
  - Cosine similarity search (brute-force, O(n·d) — fine for <100K docs)
  - Memory-mapped storage via SQLite for persistence
  - Schema: [id, text, embedding_blob, metadata_json]
"""

import sqlite3
import json
import math
import os
import time
from pathlib import Path
from typing import List, Tuple, Optional, Dict, Any

# ─── Constants ───────────────────────────────────────────────────────────────

DEFAULT_DIM = 384       # matches all-MiniLM-L6-v2 embedding dim
DEFAULT_TOP_K = 5        # memories to retrieve per query
QUANT_BITS = 4           # Turboquant-style 4-bit quantization
VALUES_PER_BYTE = 8 // QUANT_BITS  # 2 values per byte
SCHEMA_VERSION = 1

# ─── Exception types ─────────────────────────────────────────────────────────

class SubstrateError(Exception):
    pass

class SubstrateNotFoundError(SubstrateError):
    pass

# ─── 4-bit Quantization (Turboquant-style) ──────────────────────────────────

def quantize_4bit(vector: List[float]) -> Tuple[bytes, float, float]:
    """
    Compress a float32 vector to 4-bit packed storage.
    
    Args:
        vector: List of floats to quantize
        
    Returns:
        (packed_bytes, scale, zero_point)
        - packed_bytes: each byte holds two 4-bit values
        - scale: (max - min) / 15  for dequantization
        - zero_point: min value offset
    """
    n = len(vector)
    if n == 0:
        return b'', 0.0, 0.0
    
    # Find range
    min_val = min(vector)
    max_val = max(vector)
    span = max_val - min_val
    
    # Scale to 0-15 range
    if span == 0:
        # All values identical — pack as zeros
        packed = bytearray((n + 1) // 2)
        return bytes(packed), 0.0, min_val
    
    scale = span / 15.0
    
    # Quantize and pack
    packed = bytearray((n + 1) // 2)
    for i in range(n):
        q = int((vector[i] - min_val) / scale + 0.5)
        q = max(0, min(15, q))  # clamp to 4-bit
        byte_idx = i // 2
        if i % 2 == 0:
            packed[byte_idx] = q << 4  # high nibble
        else:
            packed[byte_idx] |= q      # low nibble
    
    return bytes(packed), scale, min_val


def dequantize_4bit(packed: bytes, scale: float, zero_point: float, n: int) -> List[float]:
    """
    Decompress a 4-bit packed vector back to float32.
    
    Args:
        packed: The packed bytes (2 values per byte)
        scale: Scale factor from quantization
        zero_point: Min value from quantization (bias)
        n: Original vector length
        
    Returns:
        Dequantized float list (lossy — ~0.5-1% relative error typical)
    """
    result = []
    for i in range(n):
        byte_idx = i // 2
        if byte_idx >= len(packed):
            break
        byte_val = packed[byte_idx]
        if i % 2 == 0:
            q = (byte_val >> 4) & 0x0F
        else:
            q = byte_val & 0x0F
        result.append(q * scale + zero_point)
    return result


def cosine_similarity(a: List[float], b: List[float]) -> float:
    """Compute cosine similarity between two vectors (stdlib only)."""
    if len(a) != len(b) or len(a) == 0:
        return 0.0
    
    dot = sum(x * y for x, y in zip(a, b))
    norm_a = sum(x * x for x in a)
    norm_b = sum(x * x for x in b)
    
    if norm_a == 0 or norm_b == 0:
        return 0.0
    return dot / math.sqrt(norm_a * norm_b)


# ─── Embedding Provider Interface ────────────────────────────────────────────

class EmbeddingProvider:
    """
    Abstract interface for encoding text → vector.
    
    The default implementation uses a simple character-level hash embedding
    so the substrate works out-of-the-box with zero dependencies.
    For production, swap in sentence-transformers or llama.cpp embeddings.
    """
    
    def __init__(self, dim: int = DEFAULT_DIM):
        self.dim = dim
    
    def encode(self, text: str) -> List[float]:
        """Encode text to a float vector. Override this in subclasses."""
        return self._hash_embed(text)
    
    def encode_batch(self, texts: List[str]) -> List[List[float]]:
        return [self.encode(t) for t in texts]
    
    def _hash_embed(self, text: str) -> List[float]:
        """
        Deterministic hash-based embedding for zero-dependency bootstrap.
        
        Not semantically meaningful — just creates stable vector representations.
        For actual use, replace with sentence-transformers or similar.
        """
        vec = [0.0] * self.dim
        words = text.lower().split()
        for word in words:
            h = hash(word) & 0xFFFFFFFF
            idx = h % self.dim
            vec[idx] += 1.0 + (h & 0x7F) / 128.0
        # Normalize
        norm = math.sqrt(sum(v*v for v in vec))
        if norm > 0:
            vec = [v / norm for v in vec]
        return vec


# ─── The Substrate (Memory Bank) ─────────────────────────────────────────────

class Substrate:
    """
    The brain-boosting memory substrate.
    
    Stores knowledge as 4-bit quantized vectors in a persistent SQLite store.
    The 1B parameter model queries this at inference time for context injection.
    
    Steam Deck constraints:
      - 100K documents × 384 dim × 4-bit = ~9.6MB for vectors
      - SQLite overhead ~20MB for 100K docs
      - Fits entirely in Steam Deck's 16GB shared RAM with room to spare
    """
    
    def __init__(
        self,
        db_path: str = "~/.substrate/memory.sqlite",
        dim: int = DEFAULT_DIM,
        top_k: int = DEFAULT_TOP_K,
        embedding_provider: Optional[EmbeddingProvider] = None
    ):
        self.db_path = os.path.expanduser(db_path)
        self.dim = dim
        self.top_k = top_k
        self.embed = embedding_provider or EmbeddingProvider(dim)
        self._ensure_db()
    
    def _ensure_db(self):
        """Create database and table if they don't exist."""
        os.makedirs(os.path.dirname(self.db_path), exist_ok=True)
        conn = sqlite3.connect(self.db_path)
        try:
            conn.execute("""
                CREATE TABLE IF NOT EXISTS memories (
                    id          INTEGER PRIMARY KEY AUTOINCREMENT,
                    text        TEXT NOT NULL,
                    embedding   BLOB NOT NULL,
                    scale       REAL NOT NULL,
                    zero_point  REAL NOT NULL,
                    metadata    TEXT DEFAULT '{}',
                    created_at  REAL NOT NULL,
                    access_count INTEGER DEFAULT 0,
                    last_access  REAL DEFAULT 0
                )
            """)
            conn.execute("""
                CREATE INDEX IF NOT EXISTS idx_memories_created 
                ON memories(created_at)
            """)
            conn.execute(f"PRAGMA user_version = {SCHEMA_VERSION}")
            # Database Optimization PRAGMAs for fast vector read/writes
            conn.execute("PRAGMA journal_mode = WAL")
            conn.execute("PRAGMA synchronous = NORMAL")
            conn.execute("PRAGMA mmap_size = 30000000000") # Enable memory mapped I/O for fast sequential blob scans
            conn.execute("PRAGMA temp_store = MEMORY")
            conn.commit()
        finally:
            conn.close()
    
    # ── CRUD Operations ──────────────────────────────────────────────────
    
    def store(
        self,
        text: str,
        metadata: Optional[Dict[str, Any]] = None,
        vector: Optional[List[float]] = None
    ) -> int:
        """
        Store a memory in the substrate.
        
        Args:
            text: The knowledge text to store
            metadata: Optional JSON-serializable metadata (tags, source, etc.)
            vector: Optional pre-computed vector (otherwise computed)
            
        Returns:
            memory_id: The ID of the stored memory
        """
        if vector is None:
            vector = self.embed.encode(text)
        
        if len(vector) != self.dim:
            raise SubstrateError(f"Vector dimension mismatch: got {len(vector)}, expected {self.dim}")
        
        packed, scale, zp = quantize_4bit(vector)
        metadata_json = json.dumps(metadata or {})
        
        conn = sqlite3.connect(self.db_path)
        try:
            cursor = conn.execute(
                """INSERT INTO memories (text, embedding, scale, zero_point, metadata, created_at)
                   VALUES (?, ?, ?, ?, ?, ?)""",
                (text, packed, scale, zp, metadata_json, time.time())
            )
            conn.commit()
            return cursor.lastrowid
        finally:
            conn.close()
    
    def store_batch(
        self,
        texts: List[str],
        metadatas: Optional[List[Dict[str, Any]]] = None,
        vectors: Optional[List[List[float]]] = None
    ) -> List[int]:
        """Store multiple memories efficiently."""
        if vectors is None:
            vectors = self.embed.encode_batch(texts)
        
        if metadatas is None:
            metadatas = [{}] * len(texts)
        
        ids = []
        for text, meta, vec in zip(texts, metadatas, vectors):
            ids.append(self.store(text, meta, vec))
        return ids
    
    def retrieve(self, query: str, top_k: Optional[int] = None, metadata_filter: Optional[Dict[str, Any]] = None) -> List[Dict[str, Any]]:
        """
        Query the substrate for memories relevant to the input.
        
        This is the "motherboard" routing function — it encodes the query,
        searches the compressed substrate, and returns the best matches.
        
        Args:
            query: The input text to match against
            top_k: Number of results (default: self.top_k)
            metadata_filter: Optional key-value pairs that MUST exist in the memory's JSON metadata.
            
        Returns:
            List of dicts: {id, text, similarity, metadata}
        """
        k = top_k or self.top_k
        query_vec = self.embed.encode(query)
        
        # Load all stored memories and brute-force search
        # (Optimization note: for >10K docs, swap to FAISS)
        conn = sqlite3.connect(self.db_path)
        try:
            # If metadata_filter is provided, use SQLite JSON functions to filter before O(n) scan
            if metadata_filter:
                conditions = []
                params = []
                for key, val in metadata_filter.items():
                    conditions.append(f"json_extract(metadata, '$.{key}') = ?")
                    params.append(val)
                where_clause = " WHERE " + " AND ".join(conditions)
                query_sql = f"SELECT id, text, embedding, scale, zero_point, metadata FROM memories{where_clause}"
                cursor = conn.execute(query_sql, params)
            else:
                cursor = conn.execute("SELECT id, text, embedding, scale, zero_point, metadata FROM memories")
            
            scored = []
            for row in cursor:
                mem_id, text, packed, scale, zp, metadata_json = row
                stored_vec = dequantize_4bit(packed, scale, zp, self.dim)
                sim = cosine_similarity(query_vec, stored_vec)
                scored.append((sim, {
                    "id": mem_id,
                    "text": text,
                    "similarity": round(sim, 4),
                    "metadata": json.loads(metadata_json) if metadata_json else {}
                }))
            
            # Sort by similarity descending
            scored.sort(key=lambda x: -x[0])
            
            # Update access stats
            best_ids = [s[1]["id"] for s in scored[:k]]
            for mid in best_ids:
                conn.execute(
                    "UPDATE memories SET access_count = access_count + 1, last_access = ? WHERE id = ?",
                    (time.time(), mid)
                )
            conn.commit()
            
            return [s[1] for s in scored[:k]]
        finally:
            conn.close()
    
    def get_by_id(self, mem_id: int) -> Optional[Dict[str, Any]]:
        """Retrieve a single memory by ID."""
        conn = sqlite3.connect(self.db_path)
        try:
            cursor = conn.execute(
                "SELECT id, text, metadata, created_at, access_count FROM memories WHERE id = ?",
                (mem_id,)
            )
            row = cursor.fetchone()
            if row is None:
                return None
            return {
                "id": row[0],
                "text": row[1],
                "metadata": json.loads(row[2]) if row[2] else {},
                "created_at": row[3],
                "access_count": row[4]
            }
        finally:
            conn.close()
    
    def delete(self, mem_id: int) -> bool:
        """Delete a memory by ID."""
        conn = sqlite3.connect(self.db_path)
        try:
            cursor = conn.execute("DELETE FROM memories WHERE id = ?", (mem_id,))
            conn.commit()
            return cursor.rowcount > 0
        finally:
            conn.close()
    
    def count(self) -> int:
        """Return total number of stored memories."""
        conn = sqlite3.connect(self.db_path)
        try:
            cursor = conn.execute("SELECT COUNT(*) FROM memories")
            return cursor.fetchone()[0]
        finally:
            conn.close()
    
    def stats(self) -> Dict[str, Any]:
        """Return memory bank statistics."""
        conn = sqlite3.connect(self.db_path)
        try:
            total = conn.execute("SELECT COUNT(*) FROM memories").fetchone()[0]
            if total == 0:
                return {"total": 0, "avg_access": 0, "size_bytes": 0}
            
            avg_access = conn.execute(
                "SELECT AVG(access_count) FROM memories"
            ).fetchone()[0]
            
            # Rough size estimate
            size = os.path.getsize(self.db_path) if os.path.exists(self.db_path) else 0
            
            return {
                "total": total,
                "avg_access": round(avg_access, 1),
                "size_bytes": size,
                "size_mb": round(size / (1024*1024), 2),
                "dim": self.dim,
                "quantization": f"{QUANT_BITS}-bit",
                "compression_ratio": f"{32/QUANT_BITS:.0f}x",
                "db_path": self.db_path
            }
        finally:
            conn.close()
    
    def clear(self):
        """Wipe all memories."""
        conn = sqlite3.connect(self.db_path)
        try:
            conn.execute("DELETE FROM memories")
            conn.commit()
        finally:
            conn.close()


# ─── Ingest Helpers ──────────────────────────────────────────────────────────

def ingest_file(substrate: Substrate, filepath: str, chunk_size: int = 512):
    """
    Ingest a text file by splitting into chunks and storing each.
    """
    path = Path(filepath)
    if not path.exists():
        raise SubstrateNotFoundError(f"File not found: {filepath}")
    
    text = path.read_text(encoding="utf-8", errors="replace")
    
    # Split into chunks (respect paragraph boundaries)
    chunks = []
    paragraphs = text.split("\n\n")
    current = ""
    for para in paragraphs:
        if len(current) + len(para) < chunk_size:
            current += para + "\n\n"
        else:
            if current.strip():
                chunks.append(current.strip())
            current = para + "\n\n"
    if current.strip():
        chunks.append(current.strip())
    
    ids = substrate.store_batch(chunks)
    print(f"  Ingested {len(ids)} chunks from {filepath}")
    return ids


def ingest_jsonl(substrate: Substrate, filepath: str, text_field: str = "text"):
    """Ingest a JSONL file where each line has a 'text' field."""
    path = Path(filepath)
    if not path.exists():
        raise SubstrateNotFoundError(f"File not found: {filepath}")
    
    texts = []
    metadatas = []
    with open(path, "r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            try:
                obj = json.loads(line)
                texts.append(obj.get(text_field, line))
                metadatas.append({k: v for k, v in obj.items() if k != text_field})
            except json.JSONDecodeError:
                texts.append(line)
                metadatas.append({})
    
    ids = substrate.store_batch(texts, metadatas)
    print(f"  Ingested {len(ids)} items from {filepath}")
    return ids


# ─── CLI Entrypoint ──────────────────────────────────────────────────────────

def main():
    import argparse
    
    parser = argparse.ArgumentParser(
        description="Substrate Engine - Brain-Boosting Memory Bank",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  # Interactive substrate shell
  python3 substrate_engine.py --interactive
  
  # Ingest a knowledge file
  python3 substrate_engine.py ingest --file knowledge.txt
  
  # Query the substrate
  python3 substrate_engine.py query --text "what is soulfire?"
  
  # Show stats
  python3 substrate_engine.py stats
        """
    )
    parser.add_argument("--db", "-d", default="~/.substrate/memory.sqlite",
                        help="Path to substrate database")
    parser.add_argument("--dim", type=int, default=384,
                        help="Embedding dimension")
    parser.add_argument("--top-k", type=int, default=5,
                        help="Number of memories to retrieve")
    
    subparsers = parser.add_subparsers(dest="command")
    
    ingest_parser = subparsers.add_parser("ingest", help="Ingest knowledge into substrate")
    ingest_parser.add_argument("--file", "-f", required=True, help="File to ingest")
    ingest_parser.add_argument("--format", choices=["text", "jsonl"], default="text",
                              help="File format")
    ingest_parser.add_argument("--chunk-size", type=int, default=512,
                              help="Chunk size for text files")
    
    query_parser = subparsers.add_parser("query", help="Query the substrate")
    query_parser.add_argument("--text", "-t", required=True, help="Query text")
    query_parser.add_argument("--top-k", "-k", type=int, default=None)
    
    get_parser = subparsers.add_parser("get", help="Get memory by ID")
    get_parser.add_argument("--id", type=int, required=True)
    
    delete_parser = subparsers.add_parser("delete", help="Delete memory by ID")
    delete_parser.add_argument("--id", type=int, required=True)
    
    subparsers.add_parser("stats", help="Show substrate statistics")
    subparsers.add_parser("clear", help="Clear all memories")
    
    interactive_parser = subparsers.add_parser("interactive", help="Interactive substrate shell")
    interactive_parser.add_argument("--top-k", "-k", type=int, default=None)
    
    args = parser.parse_args()
    
    sub = Substrate(db_path=args.db, dim=args.dim, top_k=args.top_k or 5)
    
    if args.command == "ingest":
        if args.format == "jsonl":
            ingest_jsonl(sub, args.file)
        else:
            ingest_file(sub, args.file, chunk_size=args.chunk_size)
        print(f"  Total memories: {sub.count()}")
    
    elif args.command == "query":
        results = sub.retrieve(args.text, top_k=args.top_k)
        print(f"\nQuery: {args.text}\n")
        for r in results:
            print(f"  [{r['id']}] sim={r['similarity']:.4f}")
            print(f"  {r['text'][:200]}...")
            print()
    
    elif args.command == "get":
        mem = sub.get_by_id(args.id)
        if mem:
            print(f"ID: {mem['id']}")
            print(f"Text: {mem['text']}")
            print(f"Metadata: {mem['metadata']}")
            print(f"Created: {mem['created_at']}")
            print(f"Accesses: {mem['access_count']}")
        else:
            print(f"No memory with ID {args.id}")
    
    elif args.command == "delete":
        ok = sub.delete(args.id)
        print(f"Deleted ID {args.id}: {ok}")
    
    elif args.command == "stats":
        stats = sub.stats()
        print("\nSubstrate Memory Bank")
        print("=" * 40)
        for k, v in stats.items():
            print(f"  {k}: {v}")
    
    elif args.command == "clear":
        confirm = input("Clear ALL memories? (y/N): ")
        if confirm.lower() == "y":
            sub.clear()
            print("All memories cleared.")
    
    elif args.command == "interactive" or args.command is None:
        print("\nSubstrate Interactive Shell")
        print("Type a query, or: /stats  /ingest <file>  /help  /quit\n")
        while True:
            try:
                line = input("substrate> ").strip()
            except (EOFError, KeyboardInterrupt):
                print()
                break
            
            if not line:
                continue
            if line == "/quit":
                break
            if line == "/help":
                print("Commands: /stats  /ingest <file>  /count  /help  /quit")
                continue
            if line == "/stats":
                s = sub.stats()
                for k, v in s.items():
                    print(f"  {k}: {v}")
                continue
            if line == "/count":
                print(f"  Total: {sub.count()}")
                continue
            if line.startswith("/ingest "):
                fpath = line[8:].strip()
                try:
                    ingest_file(sub, fpath)
                except SubstrateNotFoundError as e:
                    print(f"  Error: {e}")
                continue
            
            results = sub.retrieve(line)
            print()
            for r in results:
                sim_bar = "*" * int(r["similarity"] * 40)
                print(f"  [{r['id']}] {sim_bar} {r['similarity']:.4f}")
                print(f"  {r['text'][:150]}...")
                print()
            print(f"  ({len(results)} results)")


if __name__ == "__main__":
    main()
