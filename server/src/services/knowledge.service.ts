import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { KnowledgeChunk } from '../models/KnowledgeChunk';
import { env } from '../config/env';
import { embedText, embeddingModel, embeddingsConfigured, cosine } from './embeddings.service';

/** Roughly 500 tokens of English; the chunker never splits inside a paragraph. */
export const CHUNK_CHARS = 2000;
const PLACEHOLDER = /\[\[TO BE CONFIRMED/;

export interface RawChunk {
  source: string;
  heading: string;
  text: string;
  hasPlaceholder: boolean;
}

/** Splits one markdown file by headings, then packs paragraphs up to CHUNK_CHARS. */
export function chunkMarkdown(source: string, markdown: string): RawChunk[] {
  const out: RawChunk[] = [];
  let heading = source;
  let buf: string[] = [];

  const flush = () => {
    const paras = buf.join('\n').split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);
    let cur = '';
    const push = () => {
      if (cur.trim()) out.push({ source, heading, text: cur.trim(), hasPlaceholder: PLACEHOLDER.test(cur) });
      cur = '';
    };
    for (const p of paras) {
      if (cur && cur.length + p.length > CHUNK_CHARS) push();
      cur += (cur ? '\n\n' : '') + p;
    }
    push();
    buf = [];
  };

  for (const line of markdown.split(/\r?\n/)) {
    const m = /^(#{1,3})\s+(.*)$/.exec(line);
    if (m) {
      flush();
      heading = m[2].trim();
    } else {
      buf.push(line);
    }
  }
  flush();
  return out;
}

export function loadKnowledgeFiles(dir = path.join(__dirname, '..', '..', 'knowledge')): RawChunk[] {
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith('.md'))
    .sort()
    .flatMap((f) => chunkMarkdown(f.replace(/\.md$/, ''), fs.readFileSync(path.join(dir, f), 'utf8')));
}

const hash = (t: string) => crypto.createHash('sha256').update(t).digest('hex').slice(0, 32);

/**
 * Loads the files into KnowledgeChunk. A passage whose text has not changed
 * keeps its row (and its embedding); new or changed ones are embedded when a
 * provider is configured; passages that no longer exist are removed.
 */
export async function buildKnowledge(dir?: string): Promise<{ total: number; added: number; embedded: number; removed: number }> {
  const chunks = loadKnowledgeFiles(dir);
  let added = 0;
  let embedded = 0;
  const keep: string[] = [];

  for (const c of chunks) {
    const contentHash = hash(`${c.heading}\n${c.text}`);
    keep.push(contentHash);
    const existing = await KnowledgeChunk.findOne({ source: c.source, contentHash }).select('+embedding').lean();
    if (existing && (existing.embedding?.length || !embeddingsConfigured())) continue;
    const embedding = await embedText(`${c.heading}\n${c.text}`, 'document');
    await KnowledgeChunk.updateOne(
      { source: c.source, contentHash },
      {
        $set: {
          heading: c.heading,
          text: c.text,
          hasPlaceholder: c.hasPlaceholder,
          ...(embedding ? { embedding, embeddingModel: embeddingModel() } : {}),
        },
      },
      { upsert: true }
    );
    if (!existing) added += 1;
    if (embedding) embedded += 1;
  }
  const removed = (await KnowledgeChunk.deleteMany({ contentHash: { $nin: keep } })).deletedCount ?? 0;
  return { total: chunks.length, added, embedded, removed };
}

// ---------------------------------------------------------------- retrieval

export interface Retrieved {
  source: string;
  heading: string;
  text: string;
  score: number;
  hasPlaceholder: boolean;
  method: 'vector' | 'lexical';
}

/** Below this, nothing in the knowledge base is close enough to answer from. */
export const MIN_VECTOR_SCORE = 0.55;
export const MIN_LEXICAL_SCORE = 0.2;

const STOP = new Set('a an the is are was were be to of in on at for and or but do does did i my me we our you your it its this that with can how what when why who which if as by from not no yes'.split(' '));

export function tokens(s: string): string[] {
  return (s.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? []).filter((t) => t.length > 1 && !STOP.has(t));
}

/**
 * Share of the question's content words that a passage contains, with a
 * little weight on its heading. Words that appear in few passages count for
 * more (idf), so "split" outweighs "society" when every guide mentions
 * societies.
 */
export function lexicalScore(query: string, text: string, heading: string, idf?: Map<string, number>): number {
  const q = [...new Set(tokens(query))];
  if (q.length === 0) return 0;
  const body = new Set(tokens(text));
  const head = new Set(tokens(heading));
  const w = (t: string) => idf?.get(t) ?? 1;
  const total = q.reduce((n, t) => n + w(t), 0);
  const hits = q.reduce((n, t) => n + (body.has(t) ? w(t) : 0) + (head.has(t) ? 0.5 * w(t) : 0), 0);
  return total === 0 ? 0 : Math.min(1, hits / total);
}

function buildIdf(chunks: { text: string; heading: string }[]): Map<string, number> {
  const df = new Map<string, number>();
  for (const c of chunks) for (const t of new Set([...tokens(c.text), ...tokens(c.heading)])) df.set(t, (df.get(t) ?? 0) + 1);
  const n = chunks.length;
  return new Map([...df].map(([t, d]) => [t, Math.log(1 + n / d)]));
}

/**
 * Top-k passages for a question. Uses embeddings when the question can be
 * embedded and the chunks have them (in-process cosine, or Atlas Vector
 * Search when KNOWLEDGE_VECTOR_INDEX names an index); otherwise lexical.
 * Every hit says which method produced its score, so a threshold is never
 * applied to the wrong kind of number.
 */
export async function retrieve(query: string, k = 4): Promise<Retrieved[]> {
  const qEmbedding = await embedText(query, 'query');
  if (qEmbedding) {
    const indexName = env.KNOWLEDGE_VECTOR_INDEX;
    if (indexName) {
      try {
        const rows = await KnowledgeChunk.aggregate([
          { $vectorSearch: { index: indexName, path: 'embedding', queryVector: qEmbedding, numCandidates: 100, limit: k } },
          { $project: { source: 1, heading: 1, text: 1, hasPlaceholder: 1, score: { $meta: 'vectorSearchScore' } } },
        ]);
        if (rows.length > 0) {
          return rows.map((r) => ({ source: r.source, heading: r.heading, text: r.text, hasPlaceholder: r.hasPlaceholder, score: r.score, method: 'vector' as const }));
        }
      } catch {
        /* no such index here: fall through to in-process cosine */
      }
    }
    const all = await KnowledgeChunk.find({ embedding: { $exists: true } }).select('+embedding').lean();
    if (all.length > 0) {
      return all
        .map((c) => ({ source: c.source, heading: c.heading, text: c.text, hasPlaceholder: c.hasPlaceholder, score: cosine(qEmbedding, c.embedding ?? []), method: 'vector' as const }))
        .sort((a, b) => b.score - a.score)
        .slice(0, k);
    }
  }
  const all = await KnowledgeChunk.find({}).lean();
  const idf = buildIdf(all);
  return all
    .map((c) => ({ source: c.source, heading: c.heading, text: c.text, hasPlaceholder: c.hasPlaceholder, score: lexicalScore(query, c.text, c.heading, idf), method: 'lexical' as const }))
    .sort((a, b) => b.score - a.score)
    .slice(0, k);
}

/** True when the best passage is close enough to answer from. */
export function isConfident(hits: Retrieved[]): boolean {
  if (hits.length === 0) return false;
  const top = hits[0];
  return top.score >= (top.method === 'vector' ? MIN_VECTOR_SCORE : MIN_LEXICAL_SCORE);
}
