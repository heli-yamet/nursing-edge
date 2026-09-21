import ExcelJS from "exceljs";
import type { ImportQuestionInput } from "@/lib/content-validate";

function addSheet(
  workbook: ExcelJS.Workbook,
  name: string,
  headers: string[],
  rows: Record<string, string | number | boolean>[],
): void {
  const sheet = workbook.addWorksheet(name);
  sheet.addRow(headers);
  for (const row of rows) {
    sheet.addRow(headers.map((header) => row[header] ?? ""));
  }
}

export async function buildC2WorkbookBuffer(input: {
  questions: ImportQuestionInput[];
  includeOptions?: boolean;
  includeRationales?: boolean;
  includeTeaching?: boolean;
}): Promise<Buffer> {
  const includeOptions = input.includeOptions ?? true;
  const includeRationales = input.includeRationales ?? true;
  const includeTeaching = input.includeTeaching ?? true;
  const workbook = new ExcelJS.Workbook();

  addSheet(
    workbook,
    "QUESTIONS",
    [
      "selected_number",
      "question_version",
      "permanent_item_id",
      "original_source_q",
      "workbook_row",
      "track",
      "format",
      "source_rating",
      "system",
      "topic",
      "stem",
      "displayed_correct_answer",
      "commit_prompt",
    ],
    input.questions.map((question) => ({
      selected_number: question.selected_number,
      question_version: question.question_version,
      permanent_item_id: question.permanent_item_id,
      original_source_q: question.original_source_q,
      workbook_row: question.workbook_row,
      track: question.track,
      format: question.format,
      source_rating: question.source_rating,
      system: question.system,
      topic: question.topic,
      stem: question.stem,
      displayed_correct_answer: question.displayed_correct_answer,
      commit_prompt: question.commit_prompt,
    })),
  );

  if (includeOptions) {
    addSheet(
      workbook,
      "OPTIONS",
      [
        "question_version",
        "selected_number",
        "option_id",
        "displayed_option",
        "option_text",
        "is_correct",
        "authored_role",
        "patient_specific_option_analysis",
      ],
      input.questions.flatMap((question) =>
        question.options.map((option) => ({
          question_version: question.question_version,
          selected_number: question.selected_number,
          option_id: option.option_id,
          displayed_option: option.displayed_option,
          option_text: option.option_text,
          is_correct: option.is_correct,
          authored_role: option.authored_role,
          patient_specific_option_analysis:
            option.patient_specific_option_analysis,
        })),
      ),
    );
  }

  if (includeRationales) {
    addSheet(
      workbook,
      "RATIONALES",
      [
        "question_version",
        "selected_number",
        "clinical_key_justification",
        "learner_core_rationale",
        "focused_clinical_contrast",
        "transfer_rule",
        "next_reassessment_application",
        "clinical_source_anchors",
      ],
      input.questions.map((question) => ({
        question_version: question.question_version,
        selected_number: question.selected_number,
        ...question.rationales,
      })),
    );
  }

  if (includeTeaching) {
    addSheet(
      workbook,
      "REVIEW_TEACHING",
      [
        "question_version",
        "selected_number",
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
      ],
      input.questions.map((question) => ({
        question_version: question.question_version,
        selected_number: question.selected_number,
        ...question.review_teaching,
      })),
    );
  }

  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}
