import type { AnswerOption } from "@/lib/learner-types";
import type { ImportQuestionInput } from "@/lib/content-validate";
import {
  readXlsxSheetRows,
  sheetRowsByName,
  type SheetRow,
} from "@/lib/xlsx-rows";

function parseIsCorrect(value: string): boolean {
  const normalized = value.trim().toUpperCase();
  return (
    normalized === "TRUE" ||
    normalized === "1" ||
    normalized === "YES" ||
    normalized === "Y"
  );
}

function emptyRationales(): ImportQuestionInput["rationales"] {
  return {
    clinical_key_justification: "",
    learner_core_rationale: "",
    focused_clinical_contrast: "",
    transfer_rule: "",
    next_reassessment_application: "",
    clinical_source_anchors: "",
  };
}

function emptyTeaching(): ImportQuestionInput["review_teaching"] {
  return {
    reasoning_target: "",
    primary_interview_prompt: "",
    expected_reasoning_commitment: "",
    concise_teaching_response: "",
    optional_second_prompt: "",
    the_trap: "",
    why_it_wins: "",
    carry_it_forward: "",
    reasoning_diagnostic_tag: "",
    reasoning_map_question_version_record: "",
  };
}

function groupByVersion(rows: SheetRow[]): Map<string, SheetRow[]> {
  const grouped = new Map<string, SheetRow[]>();
  for (const row of rows) {
    const key = (row.question_version ?? "").trim();
    const list = grouped.get(key) ?? [];
    list.push(row);
    grouped.set(key, list);
  }
  return grouped;
}

export async function parseC2Workbook(
  buffer: Buffer,
): Promise<ImportQuestionInput[]> {
  const sheets = await readXlsxSheetRows(buffer);
  const questions = sheetRowsByName(sheets, "QUESTIONS");
  if (!questions) {
    throw new Error("C2 workbook is missing the QUESTIONS sheet");
  }

  const options = groupByVersion(sheetRowsByName(sheets, "OPTIONS") ?? []);
  const rationales = groupByVersion(
    sheetRowsByName(sheets, "RATIONALES") ?? [],
  );
  const teaching = groupByVersion(
    sheetRowsByName(sheets, "REVIEW_TEACHING") ?? [],
  );

  return questions.map((question) => {
    const version = (question.question_version ?? "").trim();
    const optionRows = options.get(version) ?? [];
    const rationaleRow = (rationales.get(version) ?? [])[0];
    const teachingRow = (teaching.get(version) ?? [])[0];

    const parsedOptions: AnswerOption[] = optionRows.map((option) => ({
      option_id: option.option_id ?? "",
      displayed_option: option.displayed_option ?? "",
      option_text: option.option_text ?? "",
      is_correct: parseIsCorrect(option.is_correct ?? ""),
      authored_role: option.authored_role ?? "",
      patient_specific_option_analysis:
        option.patient_specific_option_analysis ?? "",
    }));

    const selectedNumber = Number(question.selected_number);
    return {
      selected_number: Number.isFinite(selectedNumber) ? selectedNumber : 0,
      question_version: version,
      permanent_item_id: question.permanent_item_id ?? "",
      original_source_q: question.original_source_q ?? "",
      workbook_row: question.workbook_row ?? "",
      track: question.track ?? "",
      format: question.format ?? "",
      source_rating: question.source_rating ?? "",
      system: question.system ?? "",
      topic: question.topic ?? "",
      stem: question.stem ?? "",
      displayed_correct_answer: question.displayed_correct_answer ?? "",
      commit_prompt: question.commit_prompt ?? "",
      options: parsedOptions,
      rationales: rationaleRow
        ? {
            clinical_key_justification:
              rationaleRow.clinical_key_justification ?? "",
            learner_core_rationale: rationaleRow.learner_core_rationale ?? "",
            focused_clinical_contrast:
              rationaleRow.focused_clinical_contrast ?? "",
            transfer_rule: rationaleRow.transfer_rule ?? "",
            next_reassessment_application:
              rationaleRow.next_reassessment_application ?? "",
            clinical_source_anchors:
              rationaleRow.clinical_source_anchors ?? "",
          }
        : emptyRationales(),
      review_teaching: teachingRow
        ? {
            reasoning_target: teachingRow.reasoning_target ?? "",
            primary_interview_prompt:
              teachingRow.primary_interview_prompt ?? "",
            expected_reasoning_commitment:
              teachingRow.expected_reasoning_commitment ?? "",
            concise_teaching_response:
              teachingRow.concise_teaching_response ?? "",
            optional_second_prompt: teachingRow.optional_second_prompt ?? "",
            the_trap: teachingRow.the_trap ?? "",
            why_it_wins: teachingRow.why_it_wins ?? "",
            carry_it_forward: teachingRow.carry_it_forward ?? "",
            reasoning_diagnostic_tag:
              teachingRow.reasoning_diagnostic_tag ?? "",
            reasoning_map_question_version_record:
              teachingRow.reasoning_map_question_version_record ?? "",
          }
        : emptyTeaching(),
    };
  });
}
