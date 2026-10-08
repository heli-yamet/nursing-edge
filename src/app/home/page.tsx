import type { Metadata } from "next";
import { HomeDashboard } from "@/components/HomeDashboard";
import { LearnerShell } from "@/components/LearnerShell";
import { requireAuthorizedLearner } from "@/lib/learner-gate";
import { attempts } from "@/lib/learner-collections";
import { readActiveSession } from "@/lib/practice-setup";

export const metadata: Metadata = {
  title: "Home",
};

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const learner = await requireAuthorizedLearner();
  const active = await readActiveSession(learner.learner_id);
  const submitted = active
    ? await (
        await attempts()
      ).countDocuments({
        learner_id: learner.learner_id,
        session_id: active.session_id,
      })
    : 0;
  const size = active
    ? active.assigned_versions.length || active.size
    : 0;

  return (
    <LearnerShell current="home" dashboard>
      <HomeDashboard
        firstName={learner.first_name}
        session={
          active
            ? { type: active.type, size, submitted }
            : null
        }
      />
    </LearnerShell>
  );
}
