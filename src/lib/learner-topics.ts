export const LEARNER_TOPICS = [
  {
    topic_id: "cardiovascular-perfusion",
    name: "Cardiovascular & Perfusion",
  },
  {
    topic_id: "respiratory-ventilation",
    name: "Respiratory & Ventilation",
  },
  {
    topic_id: "neurologic-neurocritical-care",
    name: "Neurologic & Neurocritical Care",
  },
  {
    topic_id: "renal-endocrine-metabolic",
    name: "Renal, Endocrine & Metabolic",
  },
  {
    topic_id: "gi-hepatic-nutrition",
    name: "GI, Hepatic & Nutrition",
  },
  {
    topic_id: "infection-sepsis-immune-coagulation",
    name: "Infection, Sepsis, Immune & Coagulation",
  },
  {
    topic_id: "hematology-oxygen-delivery",
    name: "Hematology & Oxygen Delivery",
  },
  {
    topic_id: "nursing-management-safety-professional-practice",
    name: "Nursing Management, Safety & Professional Practice",
  },
] as const;

export type LearnerTopicId = (typeof LEARNER_TOPICS)[number]["topic_id"];

const SYSTEM_TO_TOPIC: Record<string, LearnerTopicId> = {
  CARDIO_PERFUSION: "cardiovascular-perfusion",
  RESP_OXY_VENT: "respiratory-ventilation",
  NEURO_EMERGENCIES: "neurologic-neurocritical-care",
  NEURO_INTRACRANIAL: "neurologic-neurocritical-care",
  SEDATION_ANALGESIA_DELIRIUM: "neurologic-neurocritical-care",
  ENDOCRINE_CRISES: "renal-endocrine-metabolic",
  FLUIDS_ELECTROLYTES_ABG: "renal-endocrine-metabolic",
  RENAL_DIALYSIS_CRRT: "renal-endocrine-metabolic",
  RENAL_METABOLIC: "renal-endocrine-metabolic",
  RENAL_GU: "renal-endocrine-metabolic",
  GI_HEPATIC_BLEED_ENCEPH: "gi-hepatic-nutrition",
  GI_HEPATIC_NUTRITION: "gi-hepatic-nutrition",
  SEPSIS_INFECTION_IMMUNE_COAG: "infection-sepsis-immune-coagulation",
  HEME_O2_DELIVERY: "hematology-oxygen-delivery",
  LEGAL_ETHICAL_PROFESSIONAL_PRACTICE:
    "nursing-management-safety-professional-practice",
  MANAGEMENT_OF_CARE: "nursing-management-safety-professional-practice",
  PERIOP_DEVICES: "nursing-management-safety-professional-practice",
};

export function mapSourceSystem(system: string): LearnerTopicId | null {
  return SYSTEM_TO_TOPIC[system.trim()] ?? null;
}
