#!/usr/bin/env python3
"""
cortex.py — The Brain Boosting Microchip: Multi-Hop, Memory Hierarchy, Write-Back
===================================================================================
Extends the substrate into a full cortical architecture:

  L1 Cache  (hot, in-RAM)    — recent/important memories, <1ms access
  L2 Substrate (4-bit disk)  — all knowledge, ~5ms access
  Multi-hop retrieval        — chain-of-thought memory walking
  Memory consolidation       — write important conversation state back to substrate
  Personality binding        — persistent persona across sessions

Architecture:
  ┌─────────────────────────────────────────────────────┐
  │                    CORTEX                            │
  │  ┌──────────┐  ┌──────────┐  ┌───────────────────┐  │
  │  │ L1 Cache │  │  Multi-  │  │ Memory            │  │
  │  │ (hot,    │──│  Hop     │──│ Consolidation     │  │
  │  │  in-RAM) │  │  Router  │  │ (write-back)      │  │
  │  └──────────┘  └────┬─────┘  └───────────────────┘  │
  │                     │                                │
  │              ┌──────▼──────┐                        │
  │              │ L2 Substrate │                        │
  │              │ (4-bit disk) │                        │
  │              └─────────────┘                        │
  └─────────────────────────────────────────────────────┘
"""

import json
import math
import os
import time
from pathlib import Path
from typing import List, Optional, Dict, Any, Tuple

import sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from substrate_engine import Substrate
from embed_providers import HybridEmbedProvider, NGramEmbeddingProvider

# ─── Config ──────────────────────────────────────────────────────────────────

DEFAULT_L1_SIZE = 16      # hot memories kept in RAM
DEFAULT_CONFIDENCE_THRESHOLD = 0.25  # min similarity to consider relevant
DEFAULT_MAX_HOPS = 3       # max retrieval hops for deep reasoning


# ═══════════════════════════════════════════════════════════════════════════════
#  L1 Cache — Hot Memory Layer (in-RAM, instant)
# ═══════════════════════════════════════════════════════════════════════════════

class L1Cache:
    """
    Fast in-memory cache for frequently accessed memories.
    
    Acts as the "L1 cache" in the brain hierarchy:
      - Most recently accessed memories stay hot
      - Frequently accessed memories get priority
      - Eviction: LRU when full
    """
    
    def __init__(self, max_size: int = DEFAULT_L1_SIZE):
        self.max_size = max_size
        self._entries: List[Dict[str, Any]] = []  # {text, vector, metadata, access_count, last_access}
    
    def get(self, text: str, vector: List[float]) -> Optional[Dict[str, Any]]:
        """Check if a memory is in L1 cache by vector similarity."""
        for entry in self._entries:
            sim = self._cosine_sim(vector, entry["vector"])
            if sim > 0.95:  # near-identical
                entry["access_count"] += 1
                entry["last_access"] = time.time()
                return entry
        return None
    
    def put(self, text: str, vector: List[float], metadata: Optional[Dict] = None):
        """Add a memory to L1 cache (hot)."""
        # Check if already present
        for entry in self._entries:
            if self._cosine_sim(vector, entry["vector"]) > 0.95:
                entry["access_count"] += 1
                entry["last_access"] = time.time()
                return
        
        # Evict if full (LRU)
        if len(self._entries) >= self.max_size:
            self._entries.sort(key=lambda x: x["last_access"])
            self._entries.pop(0)
        
        self._entries.append({
            "text": text,
            "vector": vector,
            "metadata": metadata or {},
            "access_count": 1,
            "last_access": time.time()
        })
    
    def query(self, query_vector: List[float], top_k: int = 3) -> List[Dict[str, Any]]:
        """Search L1 cache by similarity."""
        scored = []
        for entry in self._entries:
            sim = self._cosine_sim(query_vector, entry["vector"])
            if sim > 0.3:  # minimum relevance
                scored.append((sim, entry))
        scored.sort(key=lambda x: -x[0])
        
        results = []
        for sim, entry in scored[:top_k]:
            results.append({
                "text": entry["text"],
                "similarity": round(sim, 4),
                "metadata": entry["metadata"],
                "source": "L1"
            })
        return results
    
    def clear(self):
        self._entries.clear()
    
    def stats(self) -> Dict:
        return {
            "size": len(self._entries),
            "max_size": self.max_size,
            "total_accesses": sum(e["access_count"] for e in self._entries)
        }
    
    def _cosine_sim(self, a: List[float], b: List[float]) -> float:
        if len(a) != len(b) or len(a) == 0:
            return 0.0
        dot = sum(x*y for x,y in zip(a,b))
        na = math.sqrt(sum(x*x for x in a))
        nb = math.sqrt(sum(y*y for y in b))
        return dot / (na * nb) if na > 0 and nb > 0 else 0.0


# ═══════════════════════════════════════════════════════════════════════════════
#  Multi-Hop Retrieval — Chain-of-Thought Memory Walking
# ═══════════════════════════════════════════════════════════════════════════════

class MultiHopRetriever:
    """
    Recursive retrieval that walks the memory graph for deep reasoning.
    
    Instead of a single flat retrieval, this:
      1. Queries the substrate with the user's question
      2. Examines the results for new entities/concepts
      3. Queries again for each new concept (breadth-first)
      4. Stitches results into a coherent context
    
    This is how you get 3-hop reasoning from a 1B model — the retrieval
    does the chaining, not the model.
    """
    
    def __init__(
        self,
        substrate: Substrate,
        l1_cache: L1Cache,
        max_hops: int = DEFAULT_MAX_HOPS,
        confidence_threshold: float = DEFAULT_CONFIDENCE_THRESHOLD
    ):
        self.substrate = substrate
        self.l1_cache = l1_cache
        self.max_hops = max_hops
        self.confidence_threshold = confidence_threshold
    
    def retrieve(self, query: str, top_k_per_hop: int = 3) -> List[Dict[str, Any]]:
        """
        Multi-hop retrieval: query → extract entities → requery → merge.
        
        Args:
            query: User's question
            top_k_per_hop: Memories per hop
            
        Returns:
            Deduplicated, ranked list of relevant memories
        """
        all_results = []
        seen_texts = set()
        query_vector = self.substrate.embed.encode(query)
        
        # Check L1 cache first (fast path)
        l1_results = self.l1_cache.query(query_vector, top_k=top_k_per_hop)
        for r in l1_results:
            if r["text"] not in seen_texts:
                seen_texts.add(r["text"])
                all_results.append(r)
        
        # Hop 0: Direct query
        hop_queries = [query]
        explored_concepts = set()
        
        for hop in range(self.max_hops):
            if not hop_queries:
                break
            
            current_queries = hop_queries
            hop_queries = []
            
            for hq in current_queries:
                # Skip if we've already explored this concept
                hq_normalized = hq.lower().strip()
                if hq_normalized in explored_concepts:
                    continue
                explored_concepts.add(hq_normalized)
                
                # Query substrate
                results = self.substrate.retrieve(hq, top_k=top_k_per_hop)
                
                for r in results:
                    if r["text"] not in seen_texts and r["similarity"] >= self.confidence_threshold:
                        seen_texts.add(r["text"])
                        r["hop"] = hop
                        r["source"] = "L2"
                        all_results.append(r)
                        
                        # Extract new concepts from this memory for next hop
                        new_concepts = self._extract_concepts(r["text"])
                        for concept in new_concepts:
                            if concept not in explored_concepts:
                                hop_queries.append(concept)
            
            # Warm L1 cache with results
            for r in all_results:
                vec = self.substrate.embed.encode(r["text"])
                self.l1_cache.put(r["text"], vec, r.get("metadata"))
        
        # Sort by similarity, then by hop depth
        all_results.sort(key=lambda x: (-x.get("similarity", 0), x.get("hop", 0)))
        
        return all_results
    
    def _extract_concepts(self, text: str) -> List[str]:
        """Extract noun phrases and key entities for follow-up queries."""
        import re
        # Simple extraction: capitalized words, quoted terms, and n-gram noun phrases
        concepts = set()
        
        # Capitalized multi-word sequences (proper nouns)
        for match in re.finditer(r'[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*', text):
            concepts.add(match.group())
        
        # Quoted terms
        for match in re.finditer(r'"([^"]+)"', text):
            concepts.add(match.group(1))
        
        # Key technical terms (single words that appear to be domain-specific)
        domain_terms = ["soulfire", "void", "crucible", "ward", "grimoire", 
                       "archmage", "chronomancy", "enchantment"]
        for term in domain_terms:
            if term.lower() in text.lower():
                concepts.add(term)
        
        return list(concepts)


# ═══════════════════════════════════════════════════════════════════════════════
#  Memory Consolidation — Write-Back from Conversations
# ═══════════════════════════════════════════════════════════════════════════════

class MemoryConsolidator:
    """
    Writes important conversation state back into the substrate.
    
    This is the "learning" mechanism — after a conversation, the system
    stores important facts, user preferences, and interaction patterns
    so they're available in future sessions.
    
    Write strategies:
      - Facts: Store declarative statements with high confidence
      - Preferences: Store user preferences with priority tags
      - Interaction patterns: Store frequently asked questions
      - Personality: Reinforce persona traits based on usage
    """
    
    def __init__(self, substrate: Substrate, l1_cache: L1Cache):
        self.substrate = substrate
        self.l1_cache = l1_cache
        self.conversation_memory = []  # recent turns for context
    
    def note_interaction(self, query: str, response: str, metadata: Optional[Dict] = None):
        """Record a conversation turn for potential consolidation."""
        self.conversation_memory.append({
            "query": query,
            "response": response,
            "metadata": metadata or {},
            "timestamp": time.time()
        })
        # Keep last 20 turns
        if len(self.conversation_memory) > 20:
            self.conversation_memory.pop(0)
    
    def consolidate(self, force: bool = False) -> int:
        """
        Analyze recent conversation and write important memories to substrate.
        
        Returns:
            Number of new memories stored
        """
        if not self.conversation_memory:
            return 0
        
        # Only consolidate every 5 interactions (unless forced)
        if not force and len(self.conversation_memory) % 5 != 0:
            return 0
        
        stored_count = 0
        
        for turn in self.conversation_memory[-5:]:  # analyze last 5 turns
            query = turn["query"]
            response = turn["response"]
            
            # Extract potential facts (statements of fact in the response)
            facts = self._extract_facts(query, response)
            
            for fact in facts:
                # Check if already stored (dedup)
                existing = self.substrate.retrieve(fact, top_k=1)
                if existing and existing[0]["similarity"] > 0.85:
                    continue  # already have this
                
                # Store with conversation metadata
                self.substrate.store(
                    fact,
                    metadata={
                        "source": "conversation",
                        "consolidated": True,
                        "timestamp": time.time(),
                        "query": query[:100]
                    }
                )
                stored_count += 1
        
        return stored_count
    
    def _extract_facts(self, query: str, response: str) -> List[str]:
        """Extract declarative facts from a response."""
        facts = []
        
        # Clean response
        clean = response.strip()
        if not clean:
            return facts
        
        # Extract sentences that look like factual statements
        import re
        sentences = re.split(r'[.!?]+', clean)
        
        for sent in sentences:
            sent = sent.strip().lower()
            if not sent:
                continue
            
            # Heuristics for fact-like statements:
            # - Contains "is", "are", "was", "were" (declarative)
            # - Contains domain keywords
            # - Is long enough (>20 chars) but not too long (<300 chars)
            if any(verb in sent for verb in [" is ", " are ", " was ", " were ", " means "]):
                if 20 < len(sent) < 300 and not sent.startswith("i think") and not sent.startswith("maybe"):
                    facts.append(sent.capitalize())
        
        return facts


# ═══════════════════════════════════════════════════════════════════════════════
#  Personality Binding — Persistent Persona
# ═══════════════════════════════════════════════════════════════════════════════

class PersonalityBinding:
    """
    Binds a persistent personality to the substrate.
    
    Personality traits are stored as special tagged memories that get
    injected into every prompt. This creates a consistent character
    across all interactions — the model doesn't need to "remember"
    who it is between sessions.
    """
    
    def __init__(self, substrate: Substrate):
        self.substrate = substrate
    
    def load_personality(self, name: str) -> str:
        """Load a personality profile from the substrate."""
        traits = self.substrate.retrieve(
            f"personality:{name}", 
            top_k=10,
            metadata_filter={"tag": "personality", "persona": name}
        )
        if traits:
            return "\n".join(t["text"] for t in traits[:5])
        
        # Fallback to general personality tag if persona-specific fails
        fallback = self.substrate.retrieve(
            f"personality:{name}", 
            top_k=10,
            metadata_filter={"tag": "personality"}
        )
        if fallback:
            return "\n".join(t["text"] for t in fallback[:5])
            
        return ""
    
    def set_personality(self, name: str, traits: List[str]):
        """Store personality traits in the substrate."""
        for trait in traits:
            self.substrate.store(
                trait,
                metadata={"tag": "personality", "persona": name}
            )


# ═══════════════════════════════════════════════════════════════════════════════
#  Cortex — The Full Brain Boost
# ═══════════════════════════════════════════════════════════════════════════════

class Cortex:
    """
    The complete brain-boosting microchip.
    
    Integrates:
      - L1 Cache (hot, in-RAM)
      - L2 Substrate (4-bit, on disk)
      - Multi-hop retrieval (deep reasoning)
      - Memory consolidation (learning from conversation)
      - Personality binding (persistent persona)
    """
    
    def __init__(
        self,
        substrate_db: str = "~/.substrate/memory.sqlite",
        dim: int = 384,
        l1_size: int = DEFAULT_L1_SIZE,
        embed_provider: Optional[Any] = None
    ):
        self.dim = dim
        self.embed = embed_provider or HybridEmbedProvider(dim=dim)
        
        # Initialize the substrate (L2)
        self.substrate = Substrate(
            db_path=substrate_db,
            dim=dim,
            embedding_provider=self.embed
        )
        
        # Initialize L1 cache (hot memory)
        self.l1 = L1Cache(max_size=l1_size)
        
        # Initialize multi-hop retriever
        self.retriever = MultiHopRetriever(
            substrate=self.substrate,
            l1_cache=self.l1
        )
        
        # Initialize memory consolidation
        self.consolidator = MemoryConsolidator(
            substrate=self.substrate,
            l1_cache=self.l1
        )
        
        # Initialize personality binding
        self.personality = PersonalityBinding(substrate=self.substrate)
        
        # Stats
        self._query_count = 0
    
    def retrieve(self, query: str, top_k: int = 5, multi_hop: bool = True) -> Tuple[List[Dict], str]:
        """
        Full retrieval pipeline with multi-hop and L1/L2 hierarchy.
        
        Args:
            query: User's input
            top_k: Max memories to return
            multi_hop: Enable multi-hop retrieval
            
        Returns:
            (memories list, context block string)
        """
        self._query_count += 1
        
        if multi_hop:
            results = self.retriever.retrieve(query, top_k_per_hop=top_k)
        else:
            # Single-hop retrieval (flat)
            results_raw = self.substrate.retrieve(query, top_k=top_k)
            # Cross-reference with L1
            results = []
            for r in results_raw:
                if r["similarity"] >= 0.15:
                    r["hop"] = 0
                    r["source"] = "L2"
                    results.append(r)
                    # Warm L1
                    vec = self.embed.encode(r["text"])
                    self.l1.put(r["text"], vec, r.get("metadata"))
            
            # Add L1 results
            qvec = self.embed.encode(query)
            l1_results = self.l1.query(qvec, top_k=2)
            for r in l1_results:
                if not any(r["text"] == x["text"] for x in results):
                    results.append(r)
            
            results.sort(key=lambda x: -x.get("similarity", 0))
        
        # Build context block
        context_lines = ["[[CORTEX MEMORIES]]"]
        for i, mem in enumerate(results[:top_k], 1):
            text = mem["text"].replace("\n", " ").strip()[:250]
            source = mem.get("source", "L2")
            hop = mem.get("hop", 0)
            sim = mem.get("similarity", 0)
            context_lines.append(f"  [{i}] ({sim:.2f}|{source}:hop{hop}) {text}")
        context_lines.append("[[END CORTEX MEMORIES]]")
        
        context_block = "\n".join(context_lines)
        
        return results[:top_k], context_block
    
    def learn(self, query: str, response: str):
        """Record an interaction for future learning."""
        self.consolidator.note_interaction(query, response)
        stored = self.consolidator.consolidate()
        if stored > 0:
            print(f"  🧠 Consolidated {stored} new memories to substrate")
    
    def stats(self) -> Dict:
        """Return full cortex statistics."""
        l2_stats = self.substrate.stats()
        return {
            "L2_substrate": l2_stats,
            "L1_cache": self.l1.stats(),
            "queries_served": self._query_count,
            "conversation_turns": len(self.consolidator.conversation_memory)
        }


# ═══════════════════════════════════════════════════════════════════════════════
#  Quick Test
# ═══════════════════════════════════════════════════════════════════════════════

if __name__ == "__main__":
    import tempfile
    
    print("🧠 Cortex — Brain Boosting Microchip Test")
    print("="*60)
    
    # Create test database
    db = tempfile.mktemp(suffix=".db")
    cortex = Cortex(substrate_db=db)
    
    # Seed some knowledge
    cortex.substrate.store("Soulfire is a magical flame that burns the soul rather than the body.", 
                          metadata={"source": "lore", "tag": "magic"})
    cortex.substrate.store("The Scholomance is a hidden divinity school for wizards.", 
                          metadata={"source": "lore", "tag": "school"})
    cortex.substrate.store("Vaelrix is the headmaster and founder of the Scholomance.", 
                          metadata={"source": "lore", "tag": "person"})
    cortex.substrate.store("The Crucible is the final examination that students must pass to graduate.",
                          metadata={"source": "lore", "tag": "exam"})
    cortex.substrate.store("Void magic draws power from the empty spaces between worlds.",
                          metadata={"source": "lore", "tag": "magic"})
    cortex.substrate.store("The school library contains forbidden grimoires sealed behind magical locks.",
                          metadata={"source": "lore", "tag": "school"})
    cortex.substrate.store("Chronomancy is the discipline of time manipulation magic.",
                          metadata={"source": "lore", "tag": "magic"})
    
    print(f"  Seeded {cortex.substrate.count()} memories")
    
    # Test queries
    test_queries = [
        "what is soulfire?",
        "who runs the scholomance?",
        "how do students graduate?",
        "what magic disciplines are taught?"
    ]
    
    for q in test_queries:
        print(f"\n{'='*60}")
        print(f"  Query: {q}")
        print(f"{'='*60}")
        memories, context = cortex.retrieve(q, multi_hop=True)
        print(f"  Retrieved {len(memories)} memories:")
        for m in memories:
            print(f"    [{m.get('hop',0)}|{m['similarity']:.3f}] {m['text'][:70]}")
        print(f"\n  Context block ({len(context.split(chr(10)))} lines):")
        print(f"  {context[:200]}...")
    
    # Test memory consolidation
    print(f"\n{'='*60}")
    print("  Testing Memory Consolidation")
    print(f"{'='*60}")
    cortex.learn("what is soulfire?", "Soulfire is a magical flame that burns the soul.")
    cortex.learn("what is the crucible?", "The Crucible is the final test at Scholomance.")
    cortex.learn("who is vaelrix?", "Vaelrix is the headmaster and an ancient archmage.")
    cortex.learn("tell me about void magic", "Void magic draws power from between worlds.")
    cortex.learn("how does chronomancy work?", "Chronomancy is time manipulation magic.")
    
    print(f"  After consolidation: {cortex.substrate.count()} memories total")
    
    # Final stats
    print(f"\n{'='*60}")
    print("  Cortex Stats:")
    for k, v in cortex.stats().items():
        print(f"    {k}: {v}")
    
    # Cleanup
    import os
    os.unlink(db)
    print(f"\n✅ Done")
