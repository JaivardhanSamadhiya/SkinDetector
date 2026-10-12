import type { Metadata } from "next";
import { ResultsWorkspace } from "@/components/results-workspace";
export const metadata: Metadata = { title: "Analysis results" };
export default function ResultsPage() { return <ResultsWorkspace/>; }
