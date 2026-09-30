import mongoose from 'mongoose';
import { connectDb } from '../config/db';
import { buildKnowledge } from '../services/knowledge.service';
import { embeddingsConfigured } from '../services/embeddings.service';

/**
 * Loads server/knowledge/*.md into the KnowledgeChunk collection for TARA.
 *
 *   npx ts-node src/scripts/buildKnowledge.ts
 *
 * With GEMINI_API_KEY set, each new or changed passage is embedded and
 * retrieval is by meaning. Without it the passages are still stored and TARA
 * retrieves by matching words, which works but is weaker. Safe to re-run.
 */
async function main() {
  await connectDb();
  try {
    const r = await buildKnowledge();
    // eslint-disable-next-line no-console
    console.log(
      `Knowledge base: ${r.total} passages, ${r.added} new, ${r.embedded} embedded, ${r.removed} removed. ` +
        (embeddingsConfigured() ? 'Retrieval: by meaning.' : 'No GEMINI_API_KEY: retrieval will match words only.')
    );
  } finally {
    await mongoose.disconnect();
  }
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('buildKnowledge failed:', err);
  process.exit(1);
});
