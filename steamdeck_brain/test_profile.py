import sys, time
sys.path.insert(0, './')
from substrate_engine import Substrate
sub = Substrate()

t0 = time.time()
q = sub.embed.encode('Vaelrix')
t1 = time.time()
print('Encode:', t1-t0)

import sqlite3
conn = sqlite3.connect(sub.db_path)
t2 = time.time()
cursor = conn.execute("SELECT id, centroid FROM genes")
genes = cursor.fetchall()
t3 = time.time()
print('Fetch genes:', t3-t2)

# Gene similarity
import numpy as np
from turbo_quant.packet import TurboQuantPacket
query_np = np.array(q, dtype=np.float32)
query_packet = sub.tq.compress(query_np)
t4 = time.time()
gene_scores = []
for gid, gcentroid in genes:
    gpacket = TurboQuantPacket(norm=1.0, packed_bits=gcentroid, original_id=gid)
    sim = sub.tq.bitwise_similarity(query_packet, gpacket)
    gene_scores.append((sim, gid))
gene_scores.sort(key=lambda x: -x[0])
t5 = time.time()
print('Gene sim:', t5-t4)

top_genes = [g[1] for g in gene_scores[:10]]
placeholders = ",".join("?" for _ in top_genes)
t6 = time.time()
cursor = conn.execute(f"SELECT id, text, embedding, scale, zero_point, metadata FROM memories WHERE gene_id IN ({placeholders})", top_genes)
rows = cursor.fetchall()
t7 = time.time()
print('Fetch vectors:', t7-t6, 'Rows:', len(rows))

from substrate_engine import dequantize_4bit, cosine_similarity
scored = []
t8 = time.time()
for row in rows:
    mem_id, text, packed, scale, zp, metadata_json = row
    stored_vec = dequantize_4bit(packed, scale, zp, sub.dim)
    sim = cosine_similarity(q, stored_vec)
    scored.append((sim, mem_id))
t9 = time.time()
print('Cosine sim:', t9-t8)
