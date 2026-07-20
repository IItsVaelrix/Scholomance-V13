FROM node:20-bookworm-slim AS build
WORKDIR /app

# Python (dict/corpus builders) + native-addon toolchain (better-sqlite3, bcrypt).
# curl + yt-dlp system binary so youtube-dl-exec skips its own download.
RUN apt-get update && apt-get install -y \
    python3 \
    build-essential \
    curl \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*
RUN curl -fL https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp -o /usr/local/bin/yt-dlp \
    && chmod a+rx /usr/local/bin/yt-dlp

COPY package.json package-lock.json ./
# --ignore-scripts skips better-sqlite3/bcrypt install scripts, which is how the
# .node bindings get downloaded (prebuild) or compiled. Rebuild only those two
# so we keep install-scripts off for everything else.
RUN npm ci --ignore-scripts \
 && npm rebuild better-sqlite3 bcrypt \
 && node -e "require('better-sqlite3'); require('bcrypt'); console.log('native addons ok')"

COPY . .

# --- Build dictionary and corpus at image-build time ---
# Prefer the hand-enriched local DBs when present in the build context so
# production Leximancy matches the superior local substrate (devices, antonyms,
# lemma_form, rhyme corrections). Only rebuild from OEWN when no seed dict ships.
RUN mkdir -p /app/data

RUN if [ -f /app/scholomance_dict.sqlite ]; then \
      cp /app/scholomance_dict.sqlite /app/data/scholomance_dict.sqlite \
      && echo "Using local enriched scholomance_dict.sqlite (dev parity)"; \
    fi
RUN if [ -f /app/scholomance_corpus.sqlite ]; then \
      cp /app/scholomance_corpus.sqlite /app/data/scholomance_corpus.sqlite \
      && echo "Using local scholomance_corpus.sqlite (dev parity)"; \
    fi

RUN if [ ! -s /app/data/scholomance_dict.sqlite ]; then \
      ( \
        curl -fL "https://github.com/globalwordnet/english-wordnet/releases/download/2025-edition/english-wordnet-2025.xml.gz" -o /app/english-wordnet-2025.xml.gz \
        && python3 scripts/build_scholomance_dict.py --db /app/data/scholomance_dict.sqlite --oewn_path /app/english-wordnet-2025.xml.gz --overwrite \
        && python3 scripts/build_super_corpus.py --db /app/data/scholomance_corpus.sqlite --dict /app/data/scholomance_dict.sqlite --overwrite \
        && rm -f /app/english-wordnet-2025.xml.gz \
      ) || echo "Dictionary build failed — no seed DB and OEWN rebuild failed"; \
    fi

# Corpus-only fallback if dict arrived via seed but corpus did not.
RUN if [ -s /app/data/scholomance_dict.sqlite ] && [ ! -s /app/data/scholomance_corpus.sqlite ]; then \
      ( \
        curl -fL "https://github.com/globalwordnet/english-wordnet/releases/download/2025-edition/english-wordnet-2025.xml.gz" -o /app/english-wordnet-2025.xml.gz \
        && python3 scripts/build_super_corpus.py --db /app/data/scholomance_corpus.sqlite --dict /app/data/scholomance_dict.sqlite --overwrite \
        && rm -f /app/english-wordnet-2025.xml.gz \
      ) || echo "Corpus build failed"; \
    fi

# DBs are mandatory for rhyme-astrology + runtime COPY --from=build.
RUN test -s /app/data/scholomance_dict.sqlite \
    || (echo "ERROR: /app/data/scholomance_dict.sqlite missing after seed copy + OEWN build. Ship scholomance_dict.sqlite in the build context (see .dockerignore exceptions) or ensure OEWN download/build succeeds." >&2; exit 1)
RUN test -s /app/data/scholomance_corpus.sqlite \
    || (echo "ERROR: /app/data/scholomance_corpus.sqlite missing after seed copy + OEWN build. Ship scholomance_corpus.sqlite in the build context (see .dockerignore exceptions) or ensure OEWN download/build succeeds." >&2; exit 1)

# --- Rhyme correctness pass (MUST run after the Python build) ---
# build_scholomance_dict.py writes rhyme_index.rhyme_key from a simplified
# IPA->ARPAbet map that collapses AH/UH/UW into one family "U" and keys a word as
# <firstStressedFamily>-<finalCoda> — two different syllables stitched together.
# It ships love==move, blood==food, and "I" rhyming with "fire".
#
# These two steps rewrite the index from the canonical rhyme domain
# (codex/core/phonology/rhymeDomain.js) and rank candidates by real corpus usage.
# Measured on a 16-word x top-10 bake-off: 80.0% -> 100.0% true perfect rhymes,
# 6.3% -> 0% junk.
#
# The formula deliberately lives in ONE place (JS). Porting it back into the
# Python builder would recreate the two-producers-disagree bug that caused this.
RUN (test -s /app/data/scholomance_dict.sqlite && test -s /app/data/scholomance_corpus.sqlite) && ( \
      SCHOLOMANCE_DICT_PATH=/app/data/scholomance_dict.sqlite \
      SCHOLOMANCE_CORPUS_PATH=/app/data/scholomance_corpus.sqlite \
      node scripts/rebuild_rhyme_index_keys.js \
      && SCHOLOMANCE_DICT_PATH=/app/data/scholomance_dict.sqlite \
         SCHOLOMANCE_CORPUS_PATH=/app/data/scholomance_corpus.sqlite \
         node scripts/backfill_rhyme_corpus_freq.js \
    ) || echo "WARNING: rhyme index not rebuilt; rhymes fall back to the lossy legacy keys."

# --- Lexical-graph overlay (required for Leximancy / POST /api/lexical/analyze) ---
# Idempotent when the seed DB already carries a complete overlay.
ARG LEXICAL_GRAPH_TIMESTAMP=2026-07-18T00:00:00.000Z
RUN node scripts/lexical-graph.mjs all \
      --db /app/data/scholomance_dict.sqlite \
      --timestamp "${LEXICAL_GRAPH_TIMESTAMP}"

# Antonym ingest for Leximancy Oppositions — skip when already present (dev seed).
RUN node -e "const D=require('better-sqlite3');const db=new D('/app/data/scholomance_dict.sqlite',{readonly:true});const n=db.prepare(\"select count(*) c from wordnet_rel where rel='antonym'\").get().c;db.close();if(n>0){console.log('antonyms already present:',n);process.exit(0);}process.exit(2)" \
 || ( \
      mkdir -p /app/dict_data \
      && curl -fL "https://en-word.net/static/english-wordnet-2024.xml.gz" -o /app/dict_data/english-wordnet-2024.xml.gz \
      && python3 scripts/ingest_oewn_antonyms.py \
           --db /app/data/scholomance_dict.sqlite \
           --oewn_path /app/dict_data/english-wordnet-2024.xml.gz \
           --expected-release 2024 \
           --timestamp "${LEXICAL_GRAPH_TIMESTAMP}" \
      && rm -f /app/dict_data/english-wordnet-2024.xml.gz \
    )

RUN node -e "const D=require('better-sqlite3');const db=new D('/app/data/scholomance_dict.sqlite',{readonly:true});const need=['lexical_entry','lexical_entry_fts','lexical_entry_fts_map','literary_device','lemma_form'];for (const n of need){if(!db.prepare('select 1 from sqlite_master where name=?').get(n)){console.error('missing overlay table:',n);process.exit(1);}}const st=db.prepare(\"select value from meta where key='lemma_form_status'\").get();if(!st||st.value!=='complete'){console.error('lemma_form_status not complete:',st);process.exit(1);}const devices=db.prepare('select count(*) c from literary_device').get().c;const ants=db.prepare(\"select count(*) c from wordnet_rel where rel='antonym'\").get().c;if(devices<1){console.error('literary_device empty');process.exit(1);}if(ants<1){console.error('antonyms empty');process.exit(1);}console.log('lexical-graph overlay verified',{devices,ants});"

# --- App build ---
ENV SCHOLOMANCE_DICT_PATH=/app/data/scholomance_dict.sqlite
ENV SCHOLOMANCE_CORPUS_PATH=/app/data/scholomance_corpus.sqlite
ENV RHYME_ASTROLOGY_OUTPUT_DIR=/app/data/rhyme-astrology
ENV RHYME_ASTROLOGY_HOT_EDGE_WORD_LIMIT=7500

# Build Rhyme Astrology Index using the enriched substrate
RUN npm run build:rhyme-astrology:index

# Inject TurboQuant embeddings into the substrate AFTER indexing
# We run this on the newly built dictionary to ensure it's production-ready
RUN node scripts/build_vector_artifacts.js

RUN npm run build
RUN npm prune --omit=dev

# --- Runtime stage ---
FROM node:20-bookworm-slim AS runtime
WORKDIR /app

ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=8080
ENV SCHOLOMANCE_DICT_PATH=/app/data/scholomance_dict.sqlite
ENV SCHOLOMANCE_CORPUS_PATH=/app/data/scholomance_corpus.sqlite
ENV RHYME_ASTROLOGY_OUTPUT_DIR=/app/data/rhyme-astrology
ENV ENABLE_TURBOQUANT=true

COPY --from=build /app/package.json /app/package-lock.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/codex ./codex
COPY --from=build /app/src/lib ./src/lib
COPY --from=build /app/src/data ./src/data
COPY --from=build /app/dist ./dist
COPY --from=build /app/public ./public
COPY --from=build /app/scripts/ritual-init.js ./scripts/ritual-init.js
COPY --from=build /app/mailer.adapter.js ./mailer.adapter.js
COPY --from=build /app/verseir_palette_payload.json ./verseir_palette_payload.json

# Copy pre-built dictionary and corpus (seed data — copied to persistent disk on first boot)
COPY --from=build /app/data/scholomance_dict.sqlite /app/data/scholomance_dict.sqlite
COPY --from=build /app/data/scholomance_corpus.sqlite /app/data/scholomance_corpus.sqlite
COPY --from=build /app/data/rhyme-astrology ./data/rhyme-astrology

EXPOSE 8080

CMD node scripts/ritual-init.js --detach && node codex/server/index.js
