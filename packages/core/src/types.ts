export interface SearchQuery {
  term: string;
  includeContent?: boolean;
  limit?: number;
}

export interface SemanticSearchResult {
  content: string;
  relativePath: string;
  startLine: number;
  endLine: number;
  language: string;
  score: number;
  rerankScore?: number;
}

export interface EmbeddingVector {
  vector: number[];
  dimension: number;
}
