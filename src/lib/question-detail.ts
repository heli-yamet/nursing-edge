import { getDb } from "@/lib/mongo";

export type QuestionDetailOption = {
  option_id: string;
  displayed_option: string;
  option_text: string;
  is_correct: boolean;
};

export type QuestionDetailView = {
  question_version_id: string;
  question_id: string;
  format: string;
  stem: string;
  options: QuestionDetailOption[];
};

export type LinkedQuestionDetail = QuestionDetailView & {
  link_id: string;
  link_revision: number;
};

export type QuestionDetail = QuestionDetailView & {
  confirmation: LinkedQuestionDetail[];
  repair: LinkedQuestionDetail[];
};

type MapRef = {
  map_id: string;
  map_revision: number;
  question_version: string;
};

type TransferRef = {
  link_id: string;
  link_revision: number;
  anchor_map_id: string;
  anchor_map_revision: number;
  candidate_map_id: string;
  candidate_map_revision: number;
};

type SupportRef = {
  support_link_id: string;
  link_revision: number;
  clinical_question_version: string;
  ap_question_version: string;
};

type VersionDoc = {
  question_version_id?: unknown;
  question_id?: unknown;
  format?: unknown;
  stem?: unknown;
  options?: unknown;
  correct_option_ids?: unknown;
};

export function assembleQuestionDetail(input: {
  version: VersionDoc;
  maps: MapRef[];
  transferLinks: TransferRef[];
  candidateMaps: MapRef[];
  supportLinks: SupportRef[];
  linkedVersions: Map<string, VersionDoc>;
}): QuestionDetail | null {
  const owner = toView(input.version);
  if (!owner) {
    return null;
  }

  const confirmation: LinkedQuestionDetail[] = [];
  const seenConfirmation = new Set<string>();
  for (const map of input.maps) {
    if (map.question_version !== owner.question_version_id) {
      continue;
    }
    for (const link of input.transferLinks) {
      if (
        link.anchor_map_id !== map.map_id ||
        link.anchor_map_revision !== map.map_revision
      ) {
        continue;
      }
      const candidate = input.candidateMaps.find(
        (item) =>
          item.map_id === link.candidate_map_id &&
          item.map_revision === link.candidate_map_revision,
      );
      const linked = candidate
        ? toView(input.linkedVersions.get(candidate.question_version))
        : null;
      const key = `${link.link_id}\0${link.link_revision}`;
      if (!linked || seenConfirmation.has(key)) {
        continue;
      }
      seenConfirmation.add(key);
      confirmation.push({
        ...linked,
        link_id: link.link_id,
        link_revision: link.link_revision,
      });
    }
  }

  const repair: LinkedQuestionDetail[] = [];
  const seenRepair = new Set<string>();
  for (const link of input.supportLinks) {
    if (link.clinical_question_version !== owner.question_version_id) {
      continue;
    }
    const linked = toView(input.linkedVersions.get(link.ap_question_version));
    const key = `${link.support_link_id}\0${link.link_revision}`;
    if (!linked || seenRepair.has(key)) {
      continue;
    }
    seenRepair.add(key);
    repair.push({
      ...linked,
      link_id: link.support_link_id,
      link_revision: link.link_revision,
    });
  }

  return { ...owner, confirmation, repair };
}

export async function loadQuestionDetail(
  questionVersionId: string,
): Promise<QuestionDetail | null> {
  const db = await getDb();
  const version = await db.collection<VersionDoc>("question_versions").findOne(
    { question_version_id: questionVersionId },
    {
      projection: {
        _id: 0,
        question_version_id: 1,
        question_id: 1,
        format: 1,
        stem: 1,
        options: 1,
        correct_option_ids: 1,
      },
    },
  );
  if (!version) {
    return null;
  }

  const maps = await db
    .collection<MapRef>("maps")
    .find(
      { question_version: questionVersionId },
      { projection: { _id: 0, map_id: 1, map_revision: 1, question_version: 1 } },
    )
    .toArray();
  const transferLinks =
    maps.length === 0
      ? []
      : await db
          .collection<TransferRef>("transfer_links")
          .find(
            {
              $or: maps.map((map) => ({
                anchor_map_id: map.map_id,
                anchor_map_revision: map.map_revision,
              })),
            },
            {
              projection: {
                _id: 0,
                link_id: 1,
                link_revision: 1,
                anchor_map_id: 1,
                anchor_map_revision: 1,
                candidate_map_id: 1,
                candidate_map_revision: 1,
              },
            },
          )
          .toArray();
  const candidateMaps =
    transferLinks.length === 0
      ? []
      : await db
          .collection<MapRef>("maps")
          .find(
            {
              $or: transferLinks.map((link) => ({
                map_id: link.candidate_map_id,
                map_revision: link.candidate_map_revision,
              })),
            },
            {
              projection: {
                _id: 0,
                map_id: 1,
                map_revision: 1,
                question_version: 1,
              },
            },
          )
          .toArray();
  const supportLinks = await db
    .collection<SupportRef>("support_links")
    .find(
      { clinical_question_version: questionVersionId },
      {
        projection: {
          _id: 0,
          support_link_id: 1,
          link_revision: 1,
          clinical_question_version: 1,
          ap_question_version: 1,
        },
      },
    )
    .toArray();

  const linkedIds = [
    ...candidateMaps.map((map) => map.question_version),
    ...supportLinks.map((link) => link.ap_question_version),
  ].filter((id, index, all) => id && all.indexOf(id) === index);
  const linkedDocs =
    linkedIds.length === 0
      ? []
      : await db
          .collection<VersionDoc>("question_versions")
          .find(
            { question_version_id: { $in: linkedIds } },
            {
              projection: {
                _id: 0,
                question_version_id: 1,
                question_id: 1,
                format: 1,
                stem: 1,
                options: 1,
                correct_option_ids: 1,
              },
            },
          )
          .toArray();
  const linkedVersions = new Map(
    linkedDocs.flatMap((doc) => {
      const id = text(doc.question_version_id);
      return id ? [[id, doc] as const] : [];
    }),
  );

  return assembleQuestionDetail({
    version,
    maps,
    transferLinks,
    candidateMaps,
    supportLinks,
    linkedVersions,
  });
}

function toView(version: VersionDoc | undefined): QuestionDetailView | null {
  if (!version) {
    return null;
  }
  const questionVersionId = text(version.question_version_id);
  const questionId = text(version.question_id);
  if (!questionVersionId || !questionId) {
    return null;
  }
  const correctIds = new Set(
    Array.isArray(version.correct_option_ids)
      ? version.correct_option_ids.filter((id) => typeof id === "string")
      : [],
  );
  const options = Array.isArray(version.options)
    ? version.options.flatMap((option) => {
        if (!option || typeof option !== "object") {
          return [];
        }
        const row = option as {
          option_id?: unknown;
          displayed_option?: unknown;
          option_text?: unknown;
          is_correct?: unknown;
        };
        const optionId = text(row.option_id);
        if (!optionId) {
          return [];
        }
        return [
          {
            option_id: optionId,
            displayed_option: text(row.displayed_option),
            option_text: text(row.option_text),
            is_correct: row.is_correct === true || correctIds.has(optionId),
          },
        ];
      })
    : [];
  return {
    question_version_id: questionVersionId,
    question_id: questionId,
    format: text(version.format),
    stem: text(version.stem),
    options,
  };
}

function text(value: unknown): string {
  return typeof value === "string" ? value : "";
}
