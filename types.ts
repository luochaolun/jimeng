
export interface Shot {
  id: number;
  description: string;
  voiceover: string; // New: Dialogue or Sound Effect
  movement: string;  // New: Camera movement and blocking
}

export interface Group {
  id: number;
  range: string;
  narrative: string;
}

export interface AIPromptItem {
  name: string;
  description: string;
  prompt: string; // The AI prompt (Chinese)
}

export interface StoryboardSettings {
  overview: string;
  style: string; // New: Visual style description
  characters: AIPromptItem[];
  scenes: AIPromptItem[];
}

export interface StoryboardData {
  script: Shot[];
  groups: Group[];
  settings: StoryboardSettings;
  rawResponse: string;
}

export interface PromptData {
  groupId: number;
  imagePrompts: {
    shot: string;
    subject: string;
    environment: string;
    lighting: string;
    camera: string;
    colorGrade: string;
    style: string;
    quality: string;
  };
  cameraPrompts: string;
  rawResponse: string;
}

export enum AppState {
  IDLE = 'IDLE',
  GENERATING_STORYBOARD = 'GENERATING_STORYBOARD',
  REVIEW_STORYBOARD = 'REVIEW_STORYBOARD',
  GENERATING_PROMPTS = 'GENERATING_PROMPTS',
  VIEW_PROMPTS = 'VIEW_PROMPTS',
}

export interface Message {
  role: 'user' | 'model';
  text: string;
}
