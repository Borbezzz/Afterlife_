import type { Person, Project } from "@/lib/data";

export type { Person, Project } from "@/lib/data";

export interface Evidence {
  source: string;
  label: string;
  url: string;
}

export interface SearchResult {
  project: Project;
  score: number;
  reasons: string[];
  evidence: Evidence[];
  retrieval?: RetrievalStatus;
}

/** Retrieval provenance is independent from whether narration used an LLM. */
export interface RetrievalStatus {
  provider: "cognee" | "embeddings" | "local";
  status: "used" | "not_configured" | "unavailable" | "no_matches";
  message: string;
  indexing?: IndexingStatus;
}

export interface IndexingStatus {
  state: "processing" | "complete" | "failed" | "unknown";
  completed?: number;
  total?: number;
}

export type IntelligenceMode = "openai" | "local";

export interface SpeakerCandidate {
  person: Person;
  projects: Project[];
  score: number;
  reasons: string[];
  evidence: Evidence[];
  retrieval?: RetrievalStatus;
}

export interface IntroDraft {
  id: string;
  subject: string;
  body: string;
  evidence: Evidence[];
  status: "draft";
  mode: IntelligenceMode;
  created_at: string;
  projectId: string;
  personName: string;
}

export interface LocalProfile {
  personId: string;
  name?: string;
  buildingNow: string;
  wantToMeet: string;
  openToSpeaking: boolean;
  hidden: boolean;
  consent: boolean;
  updated_at: string;
}
