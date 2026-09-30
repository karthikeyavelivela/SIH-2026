import { Schema, model, Types } from 'mongoose';

/**
 * One passage of the TARA knowledge base (server/knowledge/*.md), built by
 * scripts/buildKnowledge.ts. `embedding` is present only when an embedding
 * provider was configured at build time; without it retrieval is lexical.
 */
export interface IKnowledgeChunk {
  _id: Types.ObjectId;
  /** File name without the extension, e.g. "fee-split". */
  source: string;
  /** The nearest heading above the passage, used as the citation. */
  heading: string;
  text: string;
  /** Hash of the text, so a rebuild only re-embeds what changed. */
  contentHash: string;
  embedding?: number[];
  embeddingModel?: string;
  /** True when the passage still contains a [[TO BE CONFIRMED ...]] marker. */
  hasPlaceholder: boolean;
  createdAt: Date;
}

const knowledgeChunkSchema = new Schema<IKnowledgeChunk>(
  {
    source: { type: String, required: true },
    heading: { type: String, required: true },
    text: { type: String, required: true },
    contentHash: { type: String, required: true },
    embedding: { type: [Number], default: undefined, select: false },
    embeddingModel: { type: String },
    hasPlaceholder: { type: Boolean, default: false },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

knowledgeChunkSchema.index({ source: 1, contentHash: 1 }, { unique: true });

export const KnowledgeChunk = model<IKnowledgeChunk>('KnowledgeChunk', knowledgeChunkSchema);
