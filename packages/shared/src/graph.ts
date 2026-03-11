// === Graph Data Types (for content/ JSON files) ===

export type GraphDefinition = {
  disciplineId: string;
  name: string;
  topics: GraphTopic[];
  prerequisites: GraphEdge[];
  encompassings: GraphEncompassing[];
};

export type GraphTopic = {
  id: string;
  name: string;
  description: string;
  gradeLevel: number;
  standardCode: string | null;
  problemIds: string[];
  exampleIds: string[];
};

export type GraphEdge = {
  from: string; // topic ID
  to: string; // topic ID (the one that requires `from`)
  strength: number;
};

export type GraphEncompassing = {
  parent: string;
  child: string;
  weight: number;
};
