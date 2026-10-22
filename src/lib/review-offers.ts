import { attempts, exposures, questionVersions, questions, reviewCycles } from "@/lib/learner-collections";
import { getDb } from "@/lib/mongo";
import {
  isRetiredRelationship,
  linkDecisionState,
  offerFromSupport,
  offerFromTransfer,
  targetIsFresh,
  type ExposureRelation,
  type ReviewFollowOffer,
  type SupportGate,
  type TransferGate,
} from "@/lib/review-follow";
import type { DueOwnerSource } from "@/lib/review-session";
import {
  apVariantGroups,
  dependencyRetirements,
  exposureDependencies,
  maps,
  runtimeRoles,
  supportLinks,
  topicBindings,
  transferLinks,
  variantGroups,
} from "@/lib/relationship-collections";

/**
 * Reads stored links and link_decisions. An unapproved package produces no offers.
 * A saved Review session is not rebuilt, so this encounter is not selected again.
 */
export async function loadApprovedReviewOffers(
  learnerId: string,
  due: readonly DueOwnerSource[],
): Promise<ReviewFollowOffer[]> {
  const owners = due.filter(
    (source) =>
      (source.stage === "CONFIRMATION" || source.stage === "REPAIR") &&
      typeof source.question_version_id === "string" &&
      source.question_version_id.length > 0,
  );
  if (owners.length === 0) {
    return [];
  }
  const ownerVersions = [
    ...new Set(owners.map((source) => source.question_version_id as string)),
  ];

  const [
    ownerMaps,
    supportRows,
    attemptRows,
    exposureRows,
    openCycles,
    ownerRoles,
    dependencyRows,
    retirementRows,
    apGroups,
    decisions,
  ] = await Promise.all([
    (await maps())
      .find(
        { question_version: { $in: ownerVersions } },
        {
          projection: {
            _id: 0,
            map_id: 1,
            map_revision: 1,
            question_version: 1,
            family_id: 1,
            primary_judgment_id: 1,
            context_id: 1,
            variant_group_id: 1,
          },
        },
      )
      .toArray(),
    (await supportLinks())
      .find(
        { clinical_question_version: { $in: ownerVersions } },
        {
          projection: {
            _id: 0,
            support_link_id: 1,
            link_revision: 1,
            status: 1,
            relationship_type: 1,
            trigger_scope: 1,
            clinical_question_version: 1,
            clinical_permanent_item_id: 1,
            ap_permanent_item_id: 1,
            ap_question_version: 1,
          },
        },
      )
      .toArray(),
    (await attempts())
      .find(
        { learner_id: learnerId },
        { projection: { _id: 0, question_id: 1, question_version_id: 1 } },
      )
      .toArray(),
    (await exposures())
      .find(
        { learner_id: learnerId },
        { projection: { _id: 0, question_version_id: 1 } },
      )
      .toArray(),
    (await reviewCycles())
      .find(
        { learner_id: learnerId, state: { $in: ["ACTIVE", "PAUSED"] } },
        { projection: { _id: 0, question_id: 1 } },
      )
      .toArray(),
    (await runtimeRoles())
      .find(
        { question_version_id: { $in: ownerVersions } },
        { projection: { _id: 0, question_version_id: 1, role: 1 } },
      )
      .toArray(),
    (await exposureDependencies())
      .find(
        {},
        {
          projection: {
            _id: 0,
            dependency_id: 1,
            dependency_revision: 1,
            status: 1,
            target_permanent_item_id: 1,
            target_question_version: 1,
            related_permanent_item_id: 1,
            related_question_version: 1,
            related_variant_group_id: 1,
          },
        },
      )
      .toArray(),
    (await dependencyRetirements())
      .find(
        {},
        {
          projection: {
            _id: 0,
            dependency_id: 1,
            dependency_revision: 1,
            preserve_old_target_restriction: 1,
          },
        },
      )
      .toArray(),
    (await apVariantGroups())
      .find(
        {},
        {
          projection: {
            _id: 0,
            variant_group_id: 1,
            member_permanent_item_ids_json: 1,
          },
        },
      )
      .toArray(),
    (await getDb())
      .collection("link_decisions")
      .find(
        {},
        {
          projection: {
            _id: 0,
            link_kind: 1,
            link_id: 1,
            link_revision: 1,
            state: 1,
          },
        },
      )
      .toArray(),
  ]);

  const anchorIds = [
    ...new Set(ownerMaps.map((map) => text(map.map_id)).filter((id) => id !== "")),
  ];
  const transfers =
    anchorIds.length === 0
      ? []
      : await (
          await transferLinks()
        )
          .find(
            { anchor_map_id: { $in: anchorIds } },
            {
              projection: {
                _id: 0,
                link_id: 1,
                link_revision: 1,
                status: 1,
                anchor_map_id: 1,
                anchor_map_revision: 1,
                candidate_map_id: 1,
                candidate_map_revision: 1,
              },
            },
          )
          .toArray();

  const candidateMapIds = [
    ...new Set(
      transfers.map((link) => text(link.candidate_map_id)).filter((id) => id !== ""),
    ),
  ];
  const candidateMaps =
    candidateMapIds.length === 0
      ? []
      : await (
          await maps()
        )
          .find(
            { map_id: { $in: candidateMapIds } },
            {
              projection: {
                _id: 0,
                map_id: 1,
                map_revision: 1,
                question_version: 1,
                permanent_item_id: 1,
                family_id: 1,
                primary_judgment_id: 1,
                context_id: 1,
                variant_group_id: 1,
              },
            },
          )
          .toArray();

  const versionIds = new Set<string>(ownerVersions);
  for (const map of candidateMaps) {
    const version = text(map.question_version);
    if (version) {
      versionIds.add(version);
    }
  }
  for (const link of supportRows) {
    const version = text(link.ap_question_version);
    if (version) {
      versionIds.add(version);
    }
  }
  const seenVersionIds = new Set<string>();
  const seenQuestionIds = new Set<string>();
  for (const attempt of attemptRows) {
    if (typeof attempt.question_id === "string" && attempt.question_id) {
      seenQuestionIds.add(attempt.question_id);
    }
    if (typeof attempt.question_version_id === "string" && attempt.question_version_id) {
      seenVersionIds.add(attempt.question_version_id);
      versionIds.add(attempt.question_version_id);
    }
  }
  for (const exposure of exposureRows) {
    if (typeof exposure.question_version_id === "string" && exposure.question_version_id) {
      seenVersionIds.add(exposure.question_version_id);
      versionIds.add(exposure.question_version_id);
    }
  }

  const variantIds = new Set<string>();
  for (const map of [...ownerMaps, ...candidateMaps]) {
    const variant = text(map.variant_group_id);
    if (variant) {
      variantIds.add(variant);
    }
  }
  for (const dependency of dependencyRows) {
    const variant = text(dependency.related_variant_group_id);
    if (variant) {
      variantIds.add(variant);
    }
  }

  const [versionRows, bindingRows, variantRows] = await Promise.all([
    (await questionVersions())
      .find(
        { question_version_id: { $in: [...versionIds] } },
        {
          projection: {
            _id: 0,
            question_version_id: 1,
            question_id: 1,
            format: 1,
            stem: 1,
            publication_status: 1,
            active: 1,
            valid: 1,
            complete: 1,
          },
        },
      )
      .toArray(),
    (await topicBindings())
      .find(
        { question_version: { $in: [...versionIds] } },
        {
          projection: {
            _id: 0,
            question_version: 1,
            topic_key: 1,
            topic_mapping_revision: 1,
          },
        },
      )
      .toArray(),
    variantIds.size === 0
      ? Promise.resolve([])
      : (await variantGroups())
          .find(
            { variant_group_id: { $in: [...variantIds] } },
            {
              projection: {
                _id: 0,
                variant_group_id: 1,
                variant_group_revision: 1,
                member_permanent_item_ids_json: 1,
              },
            },
          )
          .toArray(),
  ]);

  for (const version of versionRows) {
    if (
      seenVersionIds.has(version.question_version_id) &&
      typeof version.question_id === "string"
    ) {
      seenQuestionIds.add(version.question_id);
    }
  }

  const questionIds = [
    ...new Set(
      versionRows
        .map((version) => version.question_id)
        .filter((id): id is string => typeof id === "string" && id.length > 0),
    ),
  ];
  const questionRows =
    questionIds.length === 0
      ? []
      : await (
          await questions()
        )
          .find(
            { question_id: { $in: questionIds } },
            { projection: { _id: 0, question_id: 1, status: 1, topic_id: 1 } },
          )
          .toArray();

  const openQuestionIds = new Set(openCycles.map((cycle) => cycle.question_id));
  const roleByVersion = new Map(
    ownerRoles.map((role) => [role.question_version_id, role.role]),
  );
  const versionById = new Map(
    versionRows.map((version) => [version.question_version_id, version]),
  );
  const questionById = new Map(
    questionRows.map((question) => [question.question_id, question]),
  );
  const membersByVariant = variantMembers(variantRows);
  const apVariantIndex = apVariants(apGroups);
  const relations = exposureRelations(dependencyRows, retirementRows, membersByVariant);
  const decisionRows = decisions.flatMap((decision) => {
    if (
      (decision.link_kind !== "transfer" && decision.link_kind !== "support") ||
      typeof decision.link_id !== "string" ||
      typeof decision.link_revision !== "number" ||
      typeof decision.state !== "string"
    ) {
      return [];
    }
    return [
      {
        link_kind: decision.link_kind,
        link_id: decision.link_id,
        link_revision: decision.link_revision,
        state: decision.state,
      },
    ];
  });

  const offers: ReviewFollowOffer[] = [];
  for (const owner of owners) {
    const ownerVersion = owner.question_version_id as string;
    const ownerIsSibling = roleByVersion.get(ownerVersion) === "CLINICAL_SIBLING_RESERVED";
    if (owner.stage === "CONFIRMATION") {
      for (const link of transfers) {
        if (isRetiredRelationship(text(link.status))) {
          continue;
        }
        const anchor = findMap(
          ownerMaps,
          text(link.anchor_map_id),
          link.anchor_map_revision,
        );
        const candidate = findMap(
          candidateMaps,
          text(link.candidate_map_id),
          link.candidate_map_revision,
        );
        if (!anchor || text(anchor.question_version) !== ownerVersion || !candidate) {
          continue;
        }
        const candidateVersion = text(candidate.question_version);
        const candidateQuestionId = text(candidate.permanent_item_id);
        const variantId = text(candidate.variant_group_id);
        const gate: TransferGate = {
          decision: linkDecisionState(
            decisionRows,
            "transfer",
            text(link.link_id),
            typeof link.link_revision === "number" ? link.link_revision : -1,
          ),
          ownerIsSibling,
          ownerQuestionId: owner.question_id,
          ownerQuestionVersion: ownerVersion,
          anchorQuestionVersion: text(anchor.question_version),
          candidateQuestionId,
          candidateQuestionVersion: candidateVersion,
          anchorFamilyId: text(anchor.family_id),
          candidateFamilyId: text(candidate.family_id),
          anchorJudgmentId: text(anchor.primary_judgment_id),
          candidateJudgmentId: text(candidate.primary_judgment_id),
          anchorContextId: text(anchor.context_id),
          candidateContextId: text(candidate.context_id),
          anchorVariantGroupId: text(anchor.variant_group_id) || null,
          candidateVariantGroupId: variantId || null,
          anchorTopicKey: topicKey(bindingRows, ownerVersion),
          candidateTopicKey: topicKey(bindingRows, candidateVersion),
          candidateServable: versionIsServable(
            questionById.get(candidateQuestionId) ?? null,
            versionById.get(candidateVersion) ?? null,
            candidateQuestionId,
          ),
          fresh: targetIsFresh({
            questionId: candidateQuestionId,
            questionVersionId: candidateVersion,
            variantMemberIds: variantId
              ? (membersByVariant.get(variantId) ?? null)
              : [],
            seenQuestionIds,
            seenVersionIds,
            relations,
          }),
          collidesWithOpenCycle: openQuestionIds.has(candidateQuestionId),
        };
        const offer = offerFromTransfer(owner.cycle_id, gate);
        if (offer) {
          offers.push(offer);
        }
      }
    }

    if (owner.stage === "REPAIR") {
      for (const link of supportRows) {
        if (text(link.clinical_question_version) !== ownerVersion) {
          continue;
        }
        const apQuestionId = text(link.ap_permanent_item_id);
        const apVersion = text(link.ap_question_version);
        const groups = apVariantIndex.byQuestion.get(apQuestionId);
        const gate: SupportGate = {
          decision: linkDecisionState(
            decisionRows,
            "support",
            text(link.support_link_id),
            typeof link.link_revision === "number" ? link.link_revision : -1,
          ),
          status: text(link.status),
          relationshipType: text(link.relationship_type),
          triggerScope: text(link.trigger_scope),
          ownerQuestionId: owner.question_id,
          ownerQuestionVersion: ownerVersion,
          clinicalQuestionVersion: text(link.clinical_question_version),
          apQuestionId,
          apQuestionVersion: apVersion,
          apServable: versionIsServable(
            questionById.get(apQuestionId) ?? null,
            versionById.get(apVersion) ?? null,
            apQuestionId,
          ),
          fresh:
            !apVariantIndex.unreadable &&
            targetIsFresh({
              questionId: apQuestionId,
              questionVersionId: apVersion,
              variantMemberIds: groups?.memberIds ?? [],
              seenQuestionIds,
              seenVersionIds,
              relations,
            }),
          collidesWithOpenCycle: openQuestionIds.has(apQuestionId),
        };
        const offer = offerFromSupport(
          owner.cycle_id,
          gate,
          groups?.groupIds ?? [],
        );
        if (offer) {
          offers.push(offer);
        }
      }
    }
  }
  return offers;
}

function versionIsServable(
  question: { status?: string; topic_id?: string; question_id?: string } | null,
  version: {
    question_id?: string;
    format?: string;
    stem?: string;
    publication_status?: string;
    active?: boolean;
    valid?: boolean;
    complete?: boolean;
  } | null,
  questionId: string,
): boolean {
  if (!question || question.status !== "ACTIVE" || !question.topic_id) {
    return false;
  }
  if (!version || version.question_id !== questionId || !version.stem) {
    return false;
  }
  return (
    version.publication_status === "PUBLISHED" &&
    version.active === true &&
    version.valid === true &&
    version.complete === true &&
    (version.format === "MCQ" || version.format === "SATA")
  );
}

function findMap<T extends { map_id?: string; map_revision?: number }>(
  rows: readonly T[],
  mapId: string,
  mapRevision: unknown,
): T | null {
  if (!mapId || typeof mapRevision !== "number") {
    return null;
  }
  return (
    rows.find((row) => row.map_id === mapId && row.map_revision === mapRevision) ?? null
  );
}

function topicKey(
  rows: readonly {
    question_version?: string;
    topic_key?: string;
    topic_mapping_revision?: number;
  }[],
  questionVersion: string,
): string | null {
  const matches = rows.filter(
    (row) =>
      row.question_version === questionVersion &&
      typeof row.topic_key === "string" &&
      typeof row.topic_mapping_revision === "number",
  );
  if (matches.length === 0) {
    return null;
  }
  const top = Math.max(...matches.map((row) => row.topic_mapping_revision ?? 0));
  const keys = new Set(
    matches
      .filter((row) => row.topic_mapping_revision === top)
      .map((row) => row.topic_key?.trim() ?? ""),
  );
  if (keys.size !== 1) {
    return null;
  }
  const key = [...keys][0];
  return key || null;
}

function variantMembers(
  rows: readonly {
    variant_group_id?: string;
    variant_group_revision?: number;
    member_permanent_item_ids_json?: string;
  }[],
): Map<string, string[] | null> {
  const grouped = new Map<
    string,
    {
      variant_group_id?: string;
      variant_group_revision?: number;
      member_permanent_item_ids_json?: string;
    }[]
  >();
  for (const row of rows) {
    const id = text(row.variant_group_id);
    if (!id || typeof row.variant_group_revision !== "number") {
      continue;
    }
    const list = grouped.get(id) ?? [];
    list.push(row);
    grouped.set(id, list);
  }
  const members = new Map<string, string[] | null>();
  for (const [id, revisions] of grouped) {
    const top = Math.max(...revisions.map((row) => row.variant_group_revision ?? 0));
    const current = revisions.filter((row) => row.variant_group_revision === top);
    const parsed = current.map((row) => readMemberIds(row.member_permanent_item_ids_json));
    if (parsed.length !== 1 || parsed[0] === null) {
      members.set(id, null);
      continue;
    }
    members.set(id, parsed[0]);
  }
  return members;
}

function apVariants(
  rows: readonly {
    variant_group_id?: string;
    member_permanent_item_ids_json?: string;
  }[],
): {
  byQuestion: Map<string, { groupIds: string[]; memberIds: string[] }>;
  unreadable: boolean;
} {
  const byQuestion = new Map<string, { groupIds: string[]; memberIds: string[] }>();
  let unreadable = false;
  for (const row of rows) {
    const groupId = text(row.variant_group_id);
    if (!groupId) {
      continue;
    }
    const members = readMemberIds(row.member_permanent_item_ids_json);
    if (members === null) {
      unreadable = true;
      continue;
    }
    for (const member of members) {
      const current = byQuestion.get(member) ?? { groupIds: [], memberIds: [] };
      if (!current.groupIds.includes(groupId)) {
        current.groupIds.push(groupId);
      }
      for (const id of members) {
        if (!current.memberIds.includes(id)) {
          current.memberIds.push(id);
        }
      }
      byQuestion.set(member, current);
    }
  }
  return { byQuestion, unreadable };
}

function exposureRelations(
  dependencies: readonly {
    dependency_id?: string;
    dependency_revision?: number;
    status?: string;
    target_permanent_item_id?: string;
    target_question_version?: string;
    related_permanent_item_id?: string;
    related_question_version?: string;
    related_variant_group_id?: string | null;
  }[],
  retirements: readonly {
    dependency_id?: string;
    dependency_revision?: number;
    preserve_old_target_restriction?: boolean;
  }[],
  membersByVariant: ReadonlyMap<string, string[] | null>,
): ExposureRelation[] {
  const relations: ExposureRelation[] = [];
  for (const dependency of dependencies) {
    if (dependencyIsRetired(dependency, retirements)) {
      continue;
    }
    const relatedVariant = text(dependency.related_variant_group_id);
    relations.push({
      targetQuestionId: text(dependency.target_permanent_item_id),
      targetQuestionVersion: text(dependency.target_question_version),
      relatedQuestionId: text(dependency.related_permanent_item_id),
      relatedQuestionVersion: text(dependency.related_question_version),
      relatedVariantMemberIds: relatedVariant
        ? (membersByVariant.get(relatedVariant) ?? null)
        : [],
    });
  }
  return relations;
}

function dependencyIsRetired(
  dependency: {
    dependency_id?: string;
    dependency_revision?: number;
    status?: string;
  },
  retirements: readonly {
    dependency_id?: string;
    dependency_revision?: number;
    preserve_old_target_restriction?: boolean;
  }[],
): boolean {
  if (isRetiredRelationship(text(dependency.status))) {
    return true;
  }
  const matches = retirements.filter(
    (retirement) =>
      retirement.dependency_id === dependency.dependency_id &&
      retirement.dependency_revision === dependency.dependency_revision,
  );
  if (matches.length === 0) {
    return false;
  }
  return !matches.some((retirement) => retirement.preserve_old_target_restriction === true);
}

function readMemberIds(raw: unknown): string[] | null {
  if (typeof raw !== "string" || raw.trim() === "") {
    return null;
  }
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (
      !Array.isArray(parsed) ||
      parsed.length === 0 ||
      parsed.some((id) => typeof id !== "string" || id.trim() === "")
    ) {
      return null;
    }
    return parsed.map((id) => id.trim());
  } catch {
    return null;
  }
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}
