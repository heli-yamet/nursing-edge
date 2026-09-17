import { createHash } from "node:crypto";
import { mapSourceSystem } from "@/lib/learner-topics";
import type {
  AnswerOption,
  Question,
  QuestionFormat,
  QuestionRationales,
  QuestionVersion,
  ReviewTeaching,
  SourceTrack,
} from "@/lib/learner-types";

export type ImportQuestionInput = {
  selected_number: number;
  question_version: string;
  permanent_item_id: string;
  original_source_q: string;
  workbook_row: string;
  track: string;
  format: string;
  source_rating: string;
  system: string;
  topic: string;
  stem: string;
  displayed_correct_answer: string;
  commit_prompt: string;
  options: AnswerOption[];
  rationales: QuestionRationales;
  review_teaching: ReviewTeaching;
};

export type ContentValidationSuccess = {
  ok: true;
  question: Question;
  version: QuestionVersion;
};

export type ContentValidationFailure = {
  ok: false;
  errors: string[];
};

export type ContentValidationResult =
  | ContentValidationSuccess
  | ContentValidationFailure;

function required(label: string, value: string, errors: string[]): void {
  if (!value.trim()) {
    errors.push(`${label} is required`);
  }
}

function parseDisplayedLetters(displayed: string): string[] {
  const trimmed = displayed.trim().toUpperCase().replace(/\s+/g, "");
  if (!trimmed) {
    return [];
  }
  if (trimmed.includes(",")) {
    return trimmed.split(",").filter(Boolean).sort();
  }
  return trimmed.split("").sort();
}

function correctLettersFromOptions(options: AnswerOption[]): string[] {
  return options
    .filter((option) => option.is_correct)
    .map((option) => option.displayed_option.trim().toUpperCase())
    .sort();
}

export function validateImportQuestion(
  input: ImportQuestionInput,
): ContentValidationResult {
  const errors: string[] = [];

  required("permanent_item_id", input.permanent_item_id, errors);
  required("question_version", input.question_version, errors);
  required("stem", input.stem, errors);
  required("system", input.system, errors);
  required("topic", input.topic, errors);
  required("displayed_correct_answer", input.displayed_correct_answer, errors);
  required("commit_prompt", input.commit_prompt, errors);
  required("source_rating", input.source_rating, errors);

  const format = input.format.trim().toUpperCase();
  if (format !== "MCQ" && format !== "SATA") {
    errors.push("format must be MCQ or SATA");
  }

  const track = input.track.trim().toUpperCase();
  if (track !== "CCRN" && track !== "NCLEX") {
    errors.push("track must be CCRN or NCLEX");
  }

  const topic_id = mapSourceSystem(input.system);
  if (!topic_id) {
    errors.push(`unmapped source system: ${input.system}`);
  }

  const rationaleFields: (keyof QuestionRationales)[] = [
    "clinical_key_justification",
    "learner_core_rationale",
    "focused_clinical_contrast",
    "transfer_rule",
    "next_reassessment_application",
    "clinical_source_anchors",
  ];
  for (const field of rationaleFields) {
    required(`rationales.${field}`, input.rationales[field], errors);
  }

  const teachingFields: (keyof ReviewTeaching)[] = [
    "reasoning_target",
    "primary_interview_prompt",
    "expected_reasoning_commitment",
    "concise_teaching_response",
    "optional_second_prompt",
    "the_trap",
    "why_it_wins",
    "carry_it_forward",
    "reasoning_diagnostic_tag",
    "reasoning_map_question_version_record",
  ];
  for (const field of teachingFields) {
    required(`review_teaching.${field}`, input.review_teaching[field], errors);
  }

  if (!input.options.length) {
    errors.push("options are required");
  }

  const optionIds = input.options.map((option) => option.option_id);
  if (new Set(optionIds).size !== optionIds.length) {
    errors.push("option_id values must be unique");
  }

  for (const [index, option] of input.options.entries()) {
    required(`options[${index}].option_id`, option.option_id, errors);
    required(
      `options[${index}].displayed_option`,
      option.displayed_option,
      errors,
    );
    required(`options[${index}].option_text`, option.option_text, errors);
  }

  const scored = input.options.filter((option) => option.is_correct);
  if (scored.length === 0) {
    errors.push("at least one option must be correct");
  }
  if (format === "MCQ" && scored.length > 1) {
    errors.push("MCQ must have exactly one correct option");
  }

  const fromKey = parseDisplayedLetters(input.displayed_correct_answer);
  const fromOptions = correctLettersFromOptions(input.options);
  if (
    fromKey.length > 0 &&
    fromOptions.length > 0 &&
    fromKey.join("") !== fromOptions.join("")
  ) {
    errors.push(
      "OPTIONS.is_correct does not match displayed_correct_answer",
    );
  }

  if (errors.length > 0 || !topic_id) {
    return { ok: false, errors };
  }

  const correct_option_ids = scored.map((option) => option.option_id);
  const fingerprintSource = JSON.stringify({
    question_version: input.question_version,
    stem: input.stem,
    options: input.options.map((option) => ({
      option_id: option.option_id,
      option_text: option.option_text,
      is_correct: option.is_correct,
    })),
  });

  const question: Question = {
    question_id: input.permanent_item_id,
    topic_id,
    status: "ACTIVE",
    source_system: input.system,
    source_topic: input.topic,
    track: track as SourceTrack,
    selected_number: input.selected_number,
    original_source_q: String(input.original_source_q),
    workbook_row: String(input.workbook_row),
  };

  const version: QuestionVersion = {
    question_version_id: input.question_version,
    question_id: input.permanent_item_id,
    format: format as QuestionFormat,
    stem: input.stem,
    options: input.options,
    correct_option_ids,
    displayed_correct_answer: input.displayed_correct_answer,
    commit_prompt: input.commit_prompt,
    source_rating: input.source_rating,
    rationales: input.rationales,
    review_teaching: input.review_teaching,
    learner_core_rationale: input.rationales.learner_core_rationale,
    content_fingerprint: createHash("sha256")
      .update(fingerprintSource)
      .digest("hex"),
    publication_status: "STAGED",
    active: true,
    valid: true,
    complete: true,
  };

  return { ok: true, question, version };
}
