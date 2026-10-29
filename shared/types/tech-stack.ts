export type TechnologyCategory =
  | 'framework'
  | 'library'
  | 'cms'
  | 'commerce'
  | 'analytics'
  | 'monitoring'
  | 'hosting'
  | 'cdn'
  | 'ui'
  | 'build-tool'
  | 'other';

export type TechnologyConfidence = 'high' | 'medium' | 'low';

export interface PageTechnologyFinding {
  name: string;
  category: TechnologyCategory;
  confidence: TechnologyConfidence;
  evidence: string[];
}

export interface PageTechStackEvidence {
  url: string;
  title: string;
  generator?: string;
  scripts: string[];
  stylesheets: string[];
  metaNames: string[];
  htmlAttributes: Record<string, string>;
  frameworkMarkers: string[];
  technologies: PageTechnologyFinding[];
  truncated: boolean;
  capturedAt: number;
}
