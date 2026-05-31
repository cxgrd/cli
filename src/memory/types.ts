export interface ImportHubPattern {
  target: string;
  importers: string[];
  count: number;
  description: string;
}

export interface GraphDiffSummary {
  scannedAt: number;
  filesAdded: string[];
  filesRemoved: string[];
  dependencyChanges: number;
}

export interface CgPatternsFile {
  version: 1;
  lastUpdated: number;
  importHubs: ImportHubPattern[];
  layerCounts: Record<string, number>;
  lastGraphDiff?: GraphDiffSummary;
}

export interface MemorySessionEntry {
  timestamp: number;
  type: string;
  summary: string;
  metadata?: Record<string, unknown>;
}

export interface CgMemoryFile {
  version: 1;
  updatedAt: number;
  sessions: MemorySessionEntry[];
  notes: string[];
}
