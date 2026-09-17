import type { ImportQuestionInput } from "@/lib/content-validate";

export const selected1: ImportQuestionInput = {
  selected_number: 1,
  question_version: "M2-CLEANUP-SELECTED-0001",
  permanent_item_id: "W4-B015-P01-I017",
  original_source_q: "3",
  workbook_row: "5",
  track: "CCRN",
  format: "MCQ",
  source_rating: "MASTER",
  system: "CARDIO_PERFUSION",
  topic:
    "acute-aortic-dissection-intimal-tear-impulse-control-malperfusion-rupture-risk-surgical-readiness",
  stem: "A patient with confirmed acute aortic dissection arrives in the ICU with blood pressure 186/102 mm Hg and heart rate 118/min. The patient has no heart block, acute heart failure, or bronchospasm. Esmolol and nicardipine infusions are prescribed. Nicardipine is ready, but esmolol has not yet been started. Which prescribed medication sequence should the nurse initiate now while invasive arterial monitoring is established in parallel?",
  displayed_correct_answer: "C",
  commit_prompt:
    "What is the question asking, and what makes your chosen option better supported than the alternatives? Use only the information provided.",
  options: [
    {
      option_id: "M2-CLEANUP-SELECTED-0001-OPT-A",
      displayed_option: "A",
      option_text:
        "Start nicardipine now to lower systolic pressure, then add esmolol after the pressure approaches target.",
      is_correct: false,
      authored_role: "STRONGEST",
      patient_specific_option_analysis:
        "Blood-pressure reduction matters, but vasodilation before adequate impulse control can increase reflex tachycardia and shear.",
    },
    {
      option_id: "M2-CLEANUP-SELECTED-0001-OPT-B",
      displayed_option: "B",
      option_text:
        "Start both infusions together at low doses so blood pressure and heart rate decline simultaneously.",
      is_correct: false,
      authored_role: "NON-KEY",
      patient_specific_option_analysis:
        "Starting both infusions together does not establish beta blockade before vasodilation. The prescribed sequence first controls rate and contractile impulse with esmolol, then adds nicardipine if pressure remains above target.",
    },
    {
      option_id: "M2-CLEANUP-SELECTED-0001-OPT-C",
      displayed_option: "C",
      option_text:
        "Initiate the prescribed esmolol first, then add nicardipine if blood pressure remains above target.",
      is_correct: true,
      authored_role: "KEY",
      patient_specific_option_analysis:
        "Esmolol addresses heart rate and contractility first; nicardipine is added if pressure remains elevated.",
    },
    {
      option_id: "M2-CLEANUP-SELECTED-0001-OPT-D",
      displayed_option: "D",
      option_text:
        "Give a small crystalloid bolus before esmolol because lowering heart rate may reduce cardiac output.",
      is_correct: false,
      authored_role: "NON-KEY",
      patient_specific_option_analysis:
        "Routine fluid loading is not indicated for severe hypertension and does not substitute for anti-impulse therapy.",
    },
  ],
  rationales: {
    clinical_key_justification:
      "Initiate esmolol first, then add nicardipine if pressure remains above target. The key wins because the medication decision now stays within one decision family: control heart rate and contractile impulse before adding additional vasodilation. Arterial monitoring remains important and proceeds in parallel rather than competing as a separate prerequisite answer.",
    learner_core_rationale:
      "Start esmolol first. The immediate danger is not blood pressure alone: tachycardia and forceful contraction also increase aortic shear. Add nicardipine after impulse is controlled if the pressure remains above target.",
    focused_clinical_contrast:
      "Simultaneous infusion versus controlled sequence: both drugs can lower pressure, but the question asks which medication sequence to initiate. Establishing impulse control before additional vasodilation addresses reflex tachycardia and aortic shear; arterial monitoring proceeds in parallel.",
    transfer_rule:
      "In acute aortic syndrome, control aortic impulse before adding a pure vasodilator unless a contraindication changes the sequence.",
    next_reassessment_application:
      "Reassess heart rate, blood pressure, pain, bilateral pulses, neurologic status, abdominal findings, urine output, lactate, and any new malperfusion while the aortic team evaluates.",
    clinical_source_anchors:
      "Source/key: Combined audit, actual inner source ID; physical pages 6-7. American College of Cardiology | Access: source-derived / carried forward; no new guideline review.",
  },
  review_teaching: {
    reasoning_target:
      "Identify the decisive option fit distinction from supplied patient evidence without answer signposting.",
    primary_interview_prompt:
      "What is the question asking, and what makes your chosen option better supported than the alternatives? Use only the information provided.",
    expected_reasoning_commitment:
      "The patient has confirmed acute aortic dissection with severe hypertension and tachycardia and no stated contraindication to beta blockade. Esmolol should begin first to reduce heart rate, contractility, and aortic impulse; nicardipine can then be added if pressure remains above target.",
    concise_teaching_response: "Start esmolol first.",
    optional_second_prompt:
      "None. One default interaction; no additional prompt is required.",
    the_trap:
      "Simultaneous infusion versus controlled sequence: both drugs can lower pressure, but the question asks which medication sequence to initiate. Establishing impulse control before additional vasodilation addresses reflex tachycardia and aortic shear; arterial monitoring proceeds in parallel.",
    why_it_wins:
      "Initiate esmolol first, then add nicardipine if pressure remains above target. The key wins because the medication decision now stays within one decision family: control heart rate and contractile impulse before adding additional vasodilation. Arterial monitoring remains important and proceeds in parallel rather than competing as a separate prerequisite answer.",
    carry_it_forward:
      "In acute aortic syndrome, control aortic impulse before adding a pure vasodilator unless a contraindication changes the sequence.",
    reasoning_diagnostic_tag: "Option fit",
    reasoning_map_question_version_record:
      "M2-CLEANUP-SELECTED-0001; prior: RM-M2-0001-SOURCE-RESTORATION / M2-SEL-0001-RESTORED",
  },
};
