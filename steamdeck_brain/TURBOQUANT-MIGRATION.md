# TurboQuant Migration Guide (Phase 4 PDR)

This document serves as the official migration guide, API reference, and performance tuning manual for upgrading from Legacy Cortex to **TurboQuant**.

## 1. API Reference: `TurboQuantEmbedProvider`

The `TurboQuantEmbedProvider` replaces the legacy `CortexEmbedProvider` for accelerated, memory-efficient neural embeddings.

### Core Interface

```typescript
interface TurboQuantEmbedProvider {
  /**
   * Initializes the TurboQuant engine with a specified bit depth.
   * @param config - Configuration options for quantization and caching.
   */
  constructor(config: TurboQuantConfig);

  /**
   * Generates embeddings for the provided input text using quantized processing.
   * @param text - The input string to embed.
   * @returns A quantized embedding vector.
   */
  embed(text: string): Promise<Float32Array | Int8Array>;

  /**
   * Flushes the expanded L1 cache to disk/RAM.
   */
  flushCache(): void;
}
```

### Configuration Options (`TurboQuantConfig`)

| Property | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `bitDepth` | `number` | `8` | Operational bit depth for quantization (e.g., 4, 8, 16). |
| `useL1Cache` | `boolean` | `true` | Whether to utilize the expanded L1 cache engine. |
| `threadCount` | `number` | `4` | Number of worker threads for CPU-bound bitwise ops. |

---

## 2. Migration Guide (Legacy Cortex → TurboQuant)

Upgrading from Legacy Cortex involves transitioning to the new embedding provider and taking advantage of the vastly expanded L1 cache.

### L1 Cache Expansion (16 → 16,384)

The most significant architectural change in TurboQuant is the expansion of the L1 embedding cache. 
Legacy Cortex was severely bottlenecked by its hard limit of 16 cached embeddings. TurboQuant leverages a custom ring-buffer architecture to support **16,384** concurrent L1 cache entries.

**Impact:**
- **Zero-latency Cache Hits:** Frequently accessed embeddings resolve in `O(1)` time with near-zero latency.
- **Memory Footprint:** The expanded cache utilizes compressed pointers, adding merely ~12MB of overhead while increasing cache capacity by 1024x.

### Migration Steps

1. **Update Imports:**
   ```diff
   - import { CortexEmbedProvider } from '@scholomance/cortex';
   + import { TurboQuantEmbedProvider } from '@scholomance/turboquant';
   ```

2. **Initialize Provider:**
   ```diff
   - const provider = new CortexEmbedProvider({ cacheSize: 16 });
   + const provider = new TurboQuantEmbedProvider({ bitDepth: 8 });
   ```

> [!NOTE]
> The `cacheSize` parameter is deprecated. TurboQuant automatically manages the 16,384-entry L1 cache.

---

## 3. Performance Tuning Guide

TurboQuant uses highly optimized bitwise operations for quantization. Since these operations are heavily **CPU-bound**, tuning is required to balance latency and accuracy.

### Adjusting Bit Depths

The `bitDepth` parameter controls the quantization level of the generated embeddings.

- **4-bit (`bitDepth: 4`)**: Maximum performance. Best for low-resource environments (e.g., Steam Deck). Highest throughput but noticeable accuracy degradation in complex semantic matching.
- **8-bit (`bitDepth: 8`)**: The sweet spot. Recommended for production. Balances fast CPU bitwise operations with excellent semantic retention.
- **16-bit (`bitDepth: 16`)**: Maximum accuracy. Behaves similarly to Legacy Cortex. Use only when precision is paramount and CPU overhead is not a concern.

### Handling CPU-Bound Bitwise Operations

Because quantization requires intensive bitwise manipulation, you must ensure that your host's CPU is not overwhelmed, leading to event-loop blocking.

> [!TIP]
> **Thread Pool Allocation:** Ensure you allocate sufficient threads using `threadCount`. On a Steam Deck (Zen 2 architecture), we recommend setting `threadCount: 4` to leave core resources available for the main OS and application logic.

### Tuning Checklist

1. Monitor event-loop lag. If lag exceeds 50ms, decrease `bitDepth` to 4 or increase `threadCount`.
2. Ensure batch embedding operations are chunked. Do not send more than 512 strings to `embed()` simultaneously to avoid CPU stalling.
3. Call `flushCache()` periodically (e.g., every 15 minutes) if processing highly volatile streaming data, though the LRU eviction policy handles most standard workloads efficiently.
