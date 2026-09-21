import type {
  ImportBatch,
  ImportLine,
  Question,
  QuestionVersion,
} from "@/lib/learner-types";

export type ContentStore = {
  getQuestion(question_id: string): Promise<Question | null>;
  upsertQuestion(question: Question): Promise<void>;
  getVersion(question_version_id: string): Promise<QuestionVersion | null>;
  upsertVersion(version: QuestionVersion): Promise<void>;
  versionHasAttempts(question_version_id: string): Promise<boolean>;
  insertBatch(batch: ImportBatch): Promise<void>;
  insertLine(line: ImportLine): Promise<void>;
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
    async upsertQuestion(question) {
      questions.set(question.question_id, question);
    },
    async getVersion(question_version_id) {
      return versions.get(question_version_id) ?? null;
    },
    async upsertVersion(version) {
      versions.set(version.question_version_id, version);
    },
    async versionHasAttempts(question_version_id) {
      return attempted.has(question_version_id);
    },
    async insertBatch(batch) {
      batches.push(batch);
    },
    async insertLine(line) {
      lines.push(line);
    },
    async listBatches() {
      return [...batches];
    },
    async listLines(batch_id) {
      return lines.filter((line) => line.batch_id === batch_id);
    },
  };
}
