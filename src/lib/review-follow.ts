/**
 * Approved link following for Review.
 * A missing, banned, or unapproved decision produces no offer.
 * The caller keeps the clinical owner at the same due time.
 */

export type ReviewFollowKind = "alternate" | "support";

export type ReviewFollowOffer = {
  kind: ReviewFollowKind;
  cycle_id: string;
  question_id: string;
  question_version_id: string;
  variant_group_ids: readonly string[];
};

export type LinkDecisionState = "approved" | "banned" | "unapproved";

export type ExposureRelation = {
  targetQuestionId: string;
  targetQuestionVersion: string;
  relatedQuestionId: string;
  relatedQuestionVersion: string;
  /** Null means the related variant group could not be read. */
  relatedVariantMemberIds: readonly string[] | null;
};

export function linkDecisionState(
  decisions: readonly {
    link_kind: string;
    link_id: string;
    link_revision: number;
    state: string;
  }[],
  kind: "transfer" | "support",
  linkId: string,
  linkRevision: number,
): LinkDecisionState {
  const found = decisions.find(
    (decision) =>
      decision.link_kind === kind &&
      decision.link_id === linkId &&
      decision.link_revision === linkRevision,
  );
  if (found?.state === "approved" || found?.state === "banned") {
    return found.state;
  }
  return "unapproved";
}

export function isRetiredRelationship(status: string): boolean {
  return status.toUpperCase().includes("RETIRED");
}

export function targetIsFresh(input: {
  questionId: string;
  questionVersionId: string;
  /** Null means a named variant group could not be read. */
  variantMemberIds: readonly string[] | null;
  seenQuestionIds: ReadonlySet<string>;
  seenVersionIds: ReadonlySet<string>;
  relations: readonly ExposureRelation[];
}): boolean {
  if (
    input.seenQuestionIds.has(input.questionId) ||
    input.seenVersionIds.has(input.questionVersionId)
  ) {
    return false;
  }
  if (input.variantMemberIds === null) {
    return false;
  }
  if (
    input.variantMemberIds.some(
      (id) => input.seenQuestionIds.has(id) || input.seenVersionIds.has(id),
    )
  ) {
    return false;
  }

  for (const relation of input.relations) {
    const targetsThis =
      relation.targetQuestionId === input.questionId ||
      relation.targetQuestionVersion === input.questionVersionId;
    if (!targetsThis) {
      continue;
    }
    if (!relation.relatedQuestionId || !relation.relatedQuestionVersion) {
      return false;
    }
    if (relation.relatedVariantMemberIds === null) {
      return false;
    }
    if (
      input.seenQuestionIds.has(relation.relatedQuestionId) ||
      input.seenVersionIds.has(relation.relatedQuestionVersion) ||
      relation.relatedVariantMemberIds.some((id) => input.seenQuestionIds.has(id))
    ) {
      return false;
    }
  }
  return true;
}

export type TransferGate = {
  decision: LinkDecisionState;
  /** A sibling cycle has no outgoing alternate. */
  ownerIsSibling: boolean;
  ownerQuestionId: string;
  ownerQuestionVersion: string;
  anchorQuestionVersion: string;
  candidateQuestionId: string;
  candidateQuestionVersion: string;
  anchorFamilyId: string;
  candidateFamilyId: string;
  anchorJudgmentId: string;
  candidateJudgmentId: string;
  anchorContextId: string;
  candidateContextId: string;
  anchorVariantGroupId: string | null;
  candidateVariantGroupId: string | null;
  anchorTopicKey: string | null;
  candidateTopicKey: string | null;
  candidateServable: boolean;
  fresh: boolean;
  collidesWithOpenCycle: boolean;
};

export function transferLinkCanBeServed(input: TransferGate): boolean {
  if (input.decision !== "approved" || input.ownerIsSibling) {
    return false;
  }
  if (
    !sameText(input.anchorQuestionVersion, input.ownerQuestionVersion) ||
    !input.candidateQuestionId ||
    !input.candidateQuestionVersion ||
    input.candidateQuestionId === input.ownerQuestionId ||
    input.candidateQuestionVersion === input.ownerQuestionVersion
  ) {
    return false;
  }
  if (
    !sameText(input.anchorFamilyId, input.candidateFamilyId) ||
    !input.anchorFamilyId.trim() ||
    !sameText(input.anchorJudgmentId, input.candidateJudgmentId) ||
    !input.anchorJudgmentId.trim()
  ) {
    return false;
  }
  if (
    !distinctText(input.anchorContextId, input.candidateContextId) ||
    !distinctText(input.anchorVariantGroupId, input.candidateVariantGroupId)
  ) {
    return false;
  }
  if (
    !input.anchorTopicKey ||
    !input.candidateTopicKey ||
    input.anchorTopicKey !== input.candidateTopicKey
  ) {
    return false;
  }
  return input.candidateServable && input.fresh && !input.collidesWithOpenCycle;
}

export type SupportGate = {
  decision: LinkDecisionState;
  status: string;
  relationshipType: string;
  triggerScope: string;
  ownerQuestionId: string;
  ownerQuestionVersion: string;
  clinicalQuestionVersion: string;
  apQuestionId: string;
  apQuestionVersion: string;
  apServable: boolean;
  fresh: boolean;
  collidesWithOpenCycle: boolean;
};

export function supportLinkCanBeServed(input: SupportGate): boolean {
  if (input.decision !== "approved" || isRetiredRelationship(input.status)) {
    return false;
  }
  if (
    input.relationshipType !== "AP_MECHANISM_SUPPORT" ||
    input.triggerScope !== "ITEM"
  ) {
    return false;
  }
  if (
    !sameText(input.clinicalQuestionVersion, input.ownerQuestionVersion) ||
    !input.apQuestionId ||
    !input.apQuestionVersion ||
    input.apQuestionId === input.ownerQuestionId
  ) {
    return false;
  }
  return input.apServable && input.fresh && !input.collidesWithOpenCycle;
}

export function offerFromTransfer(
  cycleId: string,
  input: TransferGate,
): ReviewFollowOffer | null {
  if (!transferLinkCanBeServed(input)) {
    return null;
  }
  const variant = input.candidateVariantGroupId?.trim() ?? "";
  return {
    kind: "alternate",
    cycle_id: cycleId,
    question_id: input.candidateQuestionId,
    question_version_id: input.candidateQuestionVersion,
    variant_group_ids: variant ? [variant] : [],
  };
}

export function offerFromSupport(
  cycleId: string,
  input: SupportGate,
  variantGroupIds: readonly string[],
): ReviewFollowOffer | null {
  if (!supportLinkCanBeServed(input)) {
    return null;
  }
  return {
    kind: "support",
    cycle_id: cycleId,
    question_id: input.apQuestionId,
    question_version_id: input.apQuestionVersion,
    variant_group_ids: [...variantGroupIds],
  };
}

export function reviewAssignmentKind(assignment: {
  review_kind?: string;
}): "owner" | "alternate" | "support" {
  if (assignment.review_kind === "alternate" || assignment.review_kind === "support") {
    return assignment.review_kind;
  }
  return "owner";
}

export function reviewCycleQuestionId(assignment: {
  question_id: string;
  owner_question_id?: string;
}): string {
  return assignment.owner_question_id || assignment.question_id;
}

type SupportSlot = {
  cycle_id: string;
  edges: readonly ReviewFollowOffer[];
};

/**
 * Matches up to maxCount supports. Slot order is priority, highest first.
 * Higher-priority repairs keep a support when several maximum matchings exist.
 * Edges are tried in UTF-8 question version order, then rematched so one
 * shared support does not hide a second distinct support.
 */
export function matchPrioritySupports(
  slots: readonly SupportSlot[],
  maxCount: number,
  blockedQuestionIds: ReadonlySet<string>,
): Map<string, ReviewFollowOffer> {
  if (maxCount <= 0) {
    return new Map();
  }
  const usable = slots
    .map((slot) => ({
      cycle_id: slot.cycle_id,
      edges: [...slot.edges]
        .filter(
          (edge) =>
            edge.kind === "support" &&
            edge.cycle_id === slot.cycle_id &&
            !blockedQuestionIds.has(edge.question_id),
        )
        .sort(compareOffers),
    }))
    .filter((slot) => slot.edges.length > 0);

  for (let target = Math.min(maxCount, usable.length); target >= 1; target -= 1) {
    const matched = new Map<string, ReviewFollowOffer>();
    const usedQuestions = new Set<string>();
    const usedVariants = new Set<string>();
    if (searchSupports(usable, 0, target, matched, usedQuestions, usedVariants)) {
      return matched;
    }
  }
  return new Map();
}

export function claimAlternates(
  confirmations: readonly {
    cycle_id: string;
    question_id: string;
    variant_group_id?: string | null;
  }[],
  offers: readonly ReviewFollowOffer[],
  blockedQuestionIds: ReadonlySet<string>,
  blockedVariantGroupIds: ReadonlySet<string>,
): Map<string, ReviewFollowOffer> {
  const claimed = new Map<string, ReviewFollowOffer>();
  const usedQuestions = new Set(blockedQuestionIds);
  const usedVariants = new Set(blockedVariantGroupIds);
  for (const confirmation of confirmations) {
    const edges = offers
      .filter(
        (offer) => offer.kind === "alternate" && offer.cycle_id === confirmation.cycle_id,
      )
      .sort(compareOffers);
    for (const edge of edges) {
      if (
        edge.question_id === confirmation.question_id ||
        usedQuestions.has(edge.question_id) ||
        edge.variant_group_ids.some((id) => usedVariants.has(id))
      ) {
        continue;
      }
      claimed.set(confirmation.cycle_id, edge);
      usedQuestions.add(edge.question_id);
      for (const id of edge.variant_group_ids) {
        usedVariants.add(id);
      }
      break;
    }
  }
  return claimed;
}

function searchSupports(
  slots: readonly { cycle_id: string; edges: ReviewFollowOffer[] }[],
  index: number,
  target: number,
  matched: Map<string, ReviewFollowOffer>,
  usedQuestions: Set<string>,
  usedVariants: Set<string>,
): boolean {
  if (matched.size === target) {
    return true;
  }
  if (index >= slots.length || matched.size + (slots.length - index) < target) {
    return false;
  }
  const slot = slots[index];
  for (const edge of slot.edges) {
    if (usedQuestions.has(edge.question_id)) {
      continue;
    }
    if (edge.variant_group_ids.some((id) => usedVariants.has(id))) {
      continue;
    }
    matched.set(slot.cycle_id, edge);
    usedQuestions.add(edge.question_id);
    for (const id of edge.variant_group_ids) {
      usedVariants.add(id);
    }
    if (searchSupports(slots, index + 1, target, matched, usedQuestions, usedVariants)) {
      return true;
    }
    matched.delete(slot.cycle_id);
    usedQuestions.delete(edge.question_id);
    for (const id of edge.variant_group_ids) {
      usedVariants.delete(id);
    }
  }
  return searchSupports(slots, index + 1, target, matched, usedQuestions, usedVariants);
}

function compareOffers(left: ReviewFollowOffer, right: ReviewFollowOffer): number {
  return (
    compareUtf8(left.question_version_id, right.question_version_id) ||
    compareUtf8(left.question_id, right.question_id)
  );
}

function compareUtf8(left: string, right: string): number {
  return Buffer.compare(Buffer.from(left, "utf8"), Buffer.from(right, "utf8"));
}

function sameText(left: string, right: string): boolean {
  return left.trim() !== "" && left.trim() === right.trim();
}

function distinctText(left: string | null, right: string | null): boolean {
  const a = left?.trim() ?? "";
  const b = right?.trim() ?? "";
  return a !== "" && b !== "" && a !== b;
}
