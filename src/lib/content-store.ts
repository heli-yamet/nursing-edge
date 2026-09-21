import type {
  ImportBatch,
  ImportLine,
  Question,
  QuestionVersion,
} from "@/lib/learner-types";

export type ContentStore = {
  getQuestion(question_id: string): Promise<Question | null>;
  getQuestions(question_ids: string[]): Promise<Map<string, Question>>;
  upsertQuestion(question: Question): Promise<void>;
  upsertQuestions(questions: Question[]): Promise<void>;
  getVersion(question_version_id: string): Promise<QuestionVersion | null>;
  getVersions(
    question_version_ids: string[],
  ): Promise<Map<string, QuestionVersion>>;
  upsertVersion(version: QuestionVersion): Promise<void>;
  upsertVersions(versions: QuestionVersion[]): Promise<void>;
  versionHasAttempts(question_version_id: string): Promise<boolean>;
  versionsWithAttempts(question_version_ids: string[]): Promise<Set<string>>;
  insertBatch(batch: ImportBatch): Promise<void>;
  insertLine(line: ImportLine): Promise<void>;
  insertLines(lines: ImportLine[]): Promise<void>;
  listBatches(): Promise<ImportBatch[]>;
  listLines(batch_id: string): Promise<ImportLine[]>;
};

export type MemoryContentStore = ContentStore & {
  markAttempted(question_version_id: string): void;
  questions: Map<string, Question>;
  versions: Map<string, QuestionVersion>;
};

export function createMemoryContentStore(): MemoryContentStore {
  const questions = new Map<string, Question>();
  const versions = new Map<string, QuestionVersion>();
  const attempted = new Set<string>();
  const batches: ImportBatch[] = [];
  const lines: ImportLine[] = [];

  return {
    questions,
    versions,
    markAttempted(question_version_id: string) {
      attempted.add(question_version_id);
    },
    async getQuestion(question_id) {
      return questions.get(question_id) ?? null;
    },
    async getQuestions(question_ids) {
      const found = new Map<string, Question>();
      for (const question_id of question_ids) {
        const question = questions.get(question_id);
        if (question) {
          found.set(question_id, question);
        }
      }
      return found;
    },
    async upsertQuestion(question) {
      questions.set(question.question_id, question);
    },
    async upsertQuestions(items) {
      for (const question of items) {
        questions.set(question.question_id, question);
      }
    },
    async getVersion(question_version_id) {
      return versions.get(question_version_id) ?? null;
    },
    async getVersions(question_version_ids) {
      const found = new Map<string, QuestionVersion>();
      for (const question_version_id of question_version_ids) {
        const version = versions.get(question_version_id);
        if (version) {
          found.set(question_version_id, version);
        }
      }
      return found;
    },
    async upsertVersion(version) {
      versions.set(version.question_version_id, version);
    },
    async upsertVersions(items) {
      for (const version of items) {
        versions.set(version.question_version_id, version);
      }
    },
    async versionHasAttempts(question_version_id) {
      return attempted.has(question_version_id);
    },
    async versionsWithAttempts(question_version_ids) {
      return new Set(
        question_version_ids.filter((id) => attempted.has(id)),
      );
    },
    async insertBatch(batch) {
      batches.push(batch);
    },
    async insertLine(line) {
      lines.push(line);
    },
    async insertLines(items) {
      lines.push(...items);
    },
    async listBatches() {
      return [...batches];
    },
    async listLines(batch_id) {
      return lines.filter((line) => line.batch_id === batch_id);
    },
  };
}
