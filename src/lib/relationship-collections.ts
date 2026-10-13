import { getDb } from "@/lib/mongo";
import type {
  ApVariantGroup,
  CjClass,
  ClinicalContext,
  ClinicalMap,
  DependencyRetirement,
  EvidenceBinding,
  ExposureDependency,
  Family,
  Judgment,
  LinkEligibility,
  Mechanism,
  PrecommitTeaching,
  RuntimeRole,
  SupportLink,
  TopicBinding,
  TopicRegistryEntry,
  TransferLink,
  VariantGroup,
} from "@/lib/relationship-types";

export async function cjClasses() {
  return (await getDb()).collection<CjClass>("cj_classes");
}

export async function judgments() {
  return (await getDb()).collection<Judgment>("judgments");
}

export async function families() {
  return (await getDb()).collection<Family>("families");
}

export async function contexts() {
  return (await getDb()).collection<ClinicalContext>("contexts");
}

export async function variantGroups() {
  return (await getDb()).collection<VariantGroup>("variant_groups");
}

export async function topicRegistry() {
  return (await getDb()).collection<TopicRegistryEntry>("topic_registry");
}

export async function topicBindings() {
  return (await getDb()).collection<TopicBinding>("topic_bindings");
}

export async function maps() {
  return (await getDb()).collection<ClinicalMap>("maps");
}

export async function transferLinks() {
  return (await getDb()).collection<TransferLink>("transfer_links");
}

export async function linkEligibility() {
  return (await getDb()).collection<LinkEligibility>("link_eligibility");
}

export async function exposureDependencies() {
  return (await getDb()).collection<ExposureDependency>("exposure_dependencies");
}

export async function dependencyRetirements() {
  return (await getDb()).collection<DependencyRetirement>(
    "dependency_retirements",
  );
}

export async function precommitTeaching() {
  return (await getDb()).collection<PrecommitTeaching>("precommit_teaching");
}

export async function evidenceBindings() {
  return (await getDb()).collection<EvidenceBinding>("evidence_bindings");
}

export async function mechanisms() {
  return (await getDb()).collection<Mechanism>("mechanisms");
}

export async function supportLinks() {
  return (await getDb()).collection<SupportLink>("support_links");
}

export async function apVariantGroups() {
  return (await getDb()).collection<ApVariantGroup>("ap_variant_groups");
}

export async function runtimeRoles() {
  return (await getDb()).collection<RuntimeRole>("runtime_roles");
}
