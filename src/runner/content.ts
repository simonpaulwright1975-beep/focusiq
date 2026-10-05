/**
 * Assessment content as delivered to the employee's browser.
 *
 * DISPLAY ONLY: no answer keys or scoring metadata. Those stay server-side
 * (`question_versions.answer_key` / `scoring_meta`, Director-only) and are
 * joined to the recorded responses after submission.
 */

/** An image held in locked storage, identified by path and content fingerprint. */
export interface MediaRef {
  /** Storage path (Supabase Storage `assessment-media` bucket) or URL. */
  src: string;
  /** SHA-256 of the file bytes – the image is not shown if it does not match. */
  sha256: string;
  /** Text alternative, read by screen readers. */
  alt: string;
}

export interface OptionDef {
  id: string;
  text?: string;
  image?: MediaRef;
}

export type QuestionKind = 'single_choice' | 'ranking';

export interface QuestionDef {
  questionVersionId: string;
  kind: QuestionKind;
  stem: string;
  /** Supporting information (e.g. an email, a quote, a stock list). */
  detail?: string[];
  image?: MediaRef;
  options: OptionDef[];
  /** Shuffle option order per person (default true; off where order carries meaning). */
  shuffleOptions?: boolean;
  /** Topic within a question bank (see SectionDef.draw). */
  topic?: string;
}

export interface SectionDef {
  id: string;
  title: string;
  instructions: string[];
  /** Information shown at the start of the section that later questions rely on. */
  rememberThis?: string[];
  /** Base time limit for the whole section; absent = untimed. */
  timeLimitSeconds?: number;
  shuffleQuestions?: boolean;
  /**
   * Question bank: present only this many questions per topic, drawn at random
   * per sitting (seeded, so a resumed sitting sees the same ones). Every sitting
   * covers each topic equally, so scores from different sittings compare.
   */
  draw?: Record<string, number>;
  /** Unscored sections (e.g. motivation) are never used as performance evidence. */
  scored: boolean;
  /** Motivation sections produce a ranked motivation profile. */
  purpose?: 'motivation';
  questions: QuestionDef[];
}

export interface AssessmentDefinition {
  /** assessment_versions.id */
  version: string;
  title: string;
  estimatedMinutes: number;
  sections: SectionDef[];
}

/** Exactly what was rendered for one question – stored as `rendered_content`. */
export interface RenderedContent {
  questionVersionId: string;
  kind: QuestionKind;
  sectionId: string;
  stem: string;
  detail?: string[];
  image?: MediaRef;
  /** Options in the order this person saw them. */
  options: OptionDef[];
}
