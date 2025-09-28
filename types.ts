
export interface Feedback {
  correct_translation: string;
  accuracy_score: number;
  errors: Array<{
    type: string;
    explanation: string;
  }>;
  general_feedback: string;
}

export interface Hint {
  english_word: string;
  vietnamese_meaning: string;
}

export enum AppView {
  Setup,
  Practice,
}

export enum SetupTab {
  AI,
  User,
}
