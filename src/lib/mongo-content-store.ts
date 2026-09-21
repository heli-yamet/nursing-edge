import { getDb } from "@/lib/mongo";
import type { ContentStore } from "@/lib/content-store";
import type {
  ImportBatch,
  ImportLine,
  Question,
  QuestionVersion,
} from "@/lib/learner-types";

export async function createMongoContentStore(): Promise<ContentStore> {
  const db = await getDb();
  const questions = db.collection<Question>("questions");
  const versions = db.collection<QuestionVersion>("question_versions");
  const attempts = db.collection("attempts");
  const batches = db.collection<ImportBatch>("import_batches");
  const lines = db.collection<ImportLine>("import_lines");

  return {
    async getQuestion(question_id) {
      return questions.findOne({ question_id });
    },
    async upsertQuestion(question) {
      await questions.replaceOne({ question_id: question.question_id }, question, {
        upsert: true,
      });
    },
    async getVersion(question_version_id) {
      return versions.findOne({ question_version_id });
    },
    async upsertVersion(version) {
      await versions.replaceOne(
        { question_version_id: version.question_version_id },
        version,
        { upsert: true },
      );
    },
    async versionHasAttempts(question_version_id) {
      const found = await attempts.findOne({ question_version_id });
      return found !== null;
    },
    async insertBatch(batch) {
      await batches.insertOne(batch);
    },
    async insertLine(line) {
      await lines.insertOne(line);
    },
    async listBatches() {
      return batches.find().sort({ created_at: 1 }).toArray();
    },
    async listLines(batch_id) {
      return lines.find({ batch_id }).toArray();
    },
  };
}
