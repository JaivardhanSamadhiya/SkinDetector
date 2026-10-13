import type { Metadata } from "next";
import { PageHeading, SafetyNote } from "@/components/shared";
import { ResearchDashboard } from "@/components/research-dashboard";

export const metadata: Metadata = { title: "Research & model transparency" };

export default function ResearchPage() {
  return (
    <div className="container research-page">
      <PageHeading
        eyebrow="OPEN METHODS. HONEST LIMITS."
        title="Look into the models."
        description="Two separate image tasks, their measured evidence, and the limits behind product matching. The corrected photo experiment is exploratory and its detector remains unavailable."
      />
      <ResearchDashboard />
      <SafetyNote />
    </div>
  );
}
