import type { Metadata } from "next";
import { PageHeading, SafetyNote } from "@/components/shared";
import { ResearchDashboard } from "@/components/research-dashboard";

export const metadata: Metadata = { title: "Research & model transparency" };

export default function ResearchPage() {
  return (
    <div className="container research-page">
      <PageHeading
        eyebrow="OPEN METHODS. HONEST LIMITS."
        title="Look into the model."
        description="The task, the evidence, and the boundaries behind every research result. These are measured benchmark results, not clinical validation."
      />
      <ResearchDashboard />
      <SafetyNote />
    </div>
  );
}
