import type { Metadata } from "next";
import { RoutinePlanner } from "@/components/routine-planner";

export const metadata: Metadata = {
  title: "Your routine & spending plan",
  description: "Build a simple skin care routine from your preferences, reuse your existing basics, and check user-entered product quotes against a spending limit.",
};

export default function RoutinePage() { return <RoutinePlanner/>; }
