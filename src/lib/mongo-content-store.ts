import { getDb } from "@/lib/mongo";
import type { ContentStore } from "@/lib/content-store";
import type {
  ImportBatch,
  ImportLine,
  ImportedQuestionSummary,
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
    async getQuestions(question_ids) {
      if (question_ids.length === 0) {
        return new Map();
      }
      const docs = await questions
        .find({ question_id: { $in: question_ids } })
        .toArray();
      return new Map(docs.map((doc) => [doc.question_id, doc]));
    },
    async upsertQuestion(question) {
      await questions.replaceOne({ question_id: question.question_id }, question, {
        upsert: true,
      });
    },
    async upsertQuestions(items) {
      if (items.length === 0) {
        return;
      }
      await questions.bulkWrite(
        items.map((question) => ({
          replaceOne: {
            filter: { question_id: question.question_id },
            replacement: question,
            upsert: true,
          },
        })),
        { ordered: false },
      );
    },
    async getVersion(question_version_id) {
      return versions.findOne({ question_version_id });
    },
    async getVersions(question_version_ids) {
      if (question_version_ids.length === 0) {
        return new Map();
      }
      const docs = await versions
        .find({ question_version_id: { $in: question_version_ids } })
        .toArray();
      return new Map(docs.map((doc) => [doc.question_version_id, doc]));
    },
    async upsertVersion(version) {
      await versions.replaceOne(
        { question_version_id: version.question_version_id },
        version,
        { upsert: true },
      );
    },
    async upsertVersions(items) {
      if (items.length === 0) {
        return;
      }
      await versions.bulkWrite(
        items.map((version) => ({
          replaceOne: {
            filter: { question_version_id: version.question_version_id },
            replacement: version,
            upsert: true,
          },
        })),
        { ordered: false },
      );
    },
    async versionHasAttempts(question_version_id) {
      const found = await attempts.findOne({ question_version_id });
      return found !== null;
    },
    async versionsWithAttempts(question_version_ids) {
      if (question_version_ids.length === 0) {
        return new Set();
      }
      const found = await attempts.distinct("question_version_id", {
        question_version_id: { $in: question_version_ids },
      });
      return new Set(found.filter((id): id is string => typeof id === "string"));
    },
    async insertBatch(batch) {
      await batches.insertOne(batch);
    },
    async insertLine(line) {
      await lines.insertOne(line);
    },
    async insertLines(items) {
      if (items.length === 0) {
        return;
      }
      await lines.insertMany(items, { ordered: false });
    },
    async listBatches() {
      return batches.find().sort({ created_at: 1 }).toArray();
    },
    async listLines(batch_id) {
      return lines.find({ batch_id }).toArray();
    },
    async listImportedQuestions() {
      const [questionDocs, versionDocs] = await Promise.all([
        questions.find().toArray(),
        versions.find().toArray(),
      ]);
      const byId = new Map(
        questionDocs.map((question) => [question.question_id, question]),
      );
      const summaries: ImportedQuestionSummary[] = versionDocs.map((version) => ({
        question_id: version.question_id,
        question_version_id: version.question_version_id,
        workbook_row: byId.get(version.question_id)?.workbook_row ?? "",
        format: version.format,
        publication_status: version.publication_status,
      }));
      summaries.sort((a, b) => {
        const row = a.workbook_row.localeCompare(b.workbook_row, undefined, {
          numeric: true,
        });
        if (row !== 0) {
          return row;
        }
        return a.question_version_id.localeCompare(b.question_version_id);
      });
      return summaries;
    },
  };
}
