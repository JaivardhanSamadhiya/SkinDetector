import type { Metadata } from "next";
import { ConditionsLibrary } from "@/components/conditions-library";
export const metadata: Metadata = { title: "Skin conditions library" };
export default function ConditionsPage() { return <ConditionsLibrary/>; }
