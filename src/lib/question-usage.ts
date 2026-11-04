import { getDb } from "@/lib/mongo";
import type { Attempt, PublicationStatus } from "@/lib/learner-types";
import { countResults, formatPercent, type ResultCounts } from "@/lib/session-results";

export type VersionHistoryRow = {
  question_version_id: string;
  publication_status: PublicationStatus;
  active: boolean;
  current: boolean;
};

export type OptionSelectionRow = {
  selected_option_ids: string[];
  count: number;
  /** Share of answered attempts with this exact selection. Null when none answered. */
  rate: number | null;
  rate_label: string | null;
};

export type QuestionUsage = ResultCounts & {
  option_selections: OptionSelectionRow[];
};

export type QuestionAdminMeta = {
  question_version_id: string;
  question_id: string;
  format: string;
  runtime_role: string | null;
  publication_status: PublicationStatus;
  active: boolean;
  version_history: VersionHistoryRow[];
};

export function tallyOptionSelections(
  attempts: readonly Pick<Attempt, "selected_option_ids">[],
): OptionSelectionRow[] {
  const answered = attempts.length;
  const byKey = new Map<string, { ids: string[]; count: number }>();
  for (const attempt of attempts) {
    const ids = [...attempt.selected_option_ids].sort();
    const key = ids.join("\0");
    const bucket = byKey.get(key);
    if (bucket) {
      bucket.count += 1;
    } else {
      byKey.set(key, { ids, count: 1 });
    }
  }
  return [...byKey.values()]
    .map((row) => ({
      selected_option_ids: row.ids,
      count: row.count,
      rate: answered > 0 ? row.count / answered : null,
      rate_label:
        answered > 0 ? formatPercent(row.count / answered) : null,
    }))
    .sort(
      (left, right) =>
        right.count - left.count ||
        left.selected_option_ids.join(",").localeCompare(
          right.selected_option_ids.join(","),
        ),
    );
}

export async function loadQuestionAdminMeta(
  questionVersionId: string,
): Promise<QuestionAdminMeta | null> {
  const db = await getDb();
  const version = await db.collection("question_versions").findOne(
    { question_version_id: questionVersionId },
    {
      projection: {
        _id: 0,
        question_version_id: 1,
        question_id: 1,
        format: 1,
        publication_status: 1,
        active: 1,
      },
    },
  );
  if (
    !version ||
    typeof version.question_version_id !== "string" ||
    typeof version.question_id !== "string"
  ) {
    return null;
  }
  const roleDoc = await db.collection("runtime_roles").findOne(
    { question_version_id: questionVersionId },
    { projection: { _id: 0, role: 1 } },
  );
  const siblings = await db
    .collection("question_versions")
    .find(
      { question_id: version.question_id },
      {
        projection: {
          _id: 0,
          question_version_id: 1,
          publication_status: 1,
          active: 1,
        },
      },
    )
    .toArray();
  const history: VersionHistoryRow[] = siblings
    .filter(
      (row): row is typeof row & { question_version_id: string } =>
        typeof row.question_version_id === "string",
    )
    .map(
      (row): VersionHistoryRow => ({
        question_version_id: row.question_version_id,
        publication_status:
          row.publication_status === "PUBLISHED" ? "PUBLISHED" : "STAGED",
        active: row.active !== false,
        current: row.question_version_id === questionVersionId,
      }),
    )
    .sort((left, right) =>
      left.question_version_id.localeCompare(right.question_version_id, "en", {
        numeric: true,
      }),
    );

  return {
    question_version_id: version.question_version_id,
    question_id: version.question_id,
    format: typeof version.format === "string" ? version.format : "",
    runtime_role:
      typeof roleDoc?.role === "string" && roleDoc.role.trim() !== ""
        ? roleDoc.role
        : null,
    publication_status:
      version.publication_status === "PUBLISHED" ? "PUBLISHED" : "STAGED",
    active: version.active !== false,
    version_history: history,
  };
}

export async function loadQuestionUsage(
  questionVersionId: string,
): Promise<QuestionUsage> {
  const db = await getDb();
  const attempts = await db
    .collection<Attempt>("attempts")
    .find(
      { question_version_id: questionVersionId },
      {
        projection: {
          _id: 0,
          correct: 1,
          confidence: 1,
          six_state: 1,
          selected_option_ids: 1,
        },
      },
    )
    .toArray();
  const counts = countResults(attempts.length, attempts);
  return {
    ...counts,
    option_selections: tallyOptionSelections(attempts),
  };
}
