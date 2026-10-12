import type { Metadata } from "next";
import { AnalysisWorkspace } from "@/components/analysis-workspace";
export const metadata: Metadata = { title: "Skin analysis" };
export default function AnalysisPage() { return <AnalysisWorkspace/>; }
