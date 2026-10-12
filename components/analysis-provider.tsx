"use client";
import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import type { AnalyzeResponse } from "@/lib/types";
import { DEFAULT_SKINCARE_PREFERENCES, SkincarePreferencesSchema, type SkincarePreferences } from "@/lib/skincare-preferences";
type AnalysisSession = { file: File | null; preview: string | null; result: AnalyzeResponse | null; preferences: SkincarePreferences; hasPreferences: boolean; setPreferences: (preferences: SkincarePreferences) => void; resetPreferences: () => void; setFile: (file: File | null) => void; setResult: (result: AnalyzeResponse | null) => void; clear: () => void };
const Context = createContext<AnalysisSession | null>(null);
export function AnalysisProvider({ children }: { children: ReactNode }) {
  const [file, setFileState] = useState<File | null>(null); const [preview, setPreview] = useState<string | null>(null); const [result, setResult] = useState<AnalyzeResponse | null>(null); const url = useRef<string | null>(null);
  const [preferences, setPreferencesState] = useState<SkincarePreferences>(() => SkincarePreferencesSchema.parse(DEFAULT_SKINCARE_PREFERENCES));
  const [hasPreferences, setHasPreferences] = useState(false);
  function setPreferences(next: SkincarePreferences) { setPreferencesState(SkincarePreferencesSchema.parse(next)); setHasPreferences(true); }
  function resetPreferences() { setPreferencesState(SkincarePreferencesSchema.parse(DEFAULT_SKINCARE_PREFERENCES)); setHasPreferences(false); }
  function setFile(next: File | null) { if (url.current) URL.revokeObjectURL(url.current); url.current = next ? URL.createObjectURL(next) : null; setPreview(url.current); setFileState(next); setResult(null); }
  function clear() { setFile(null); resetPreferences(); }
  useEffect(() => () => { if (url.current) URL.revokeObjectURL(url.current); }, []);
  return <Context.Provider value={{ file, preview, result, preferences, hasPreferences, setPreferences, resetPreferences, setFile, setResult, clear }}>{children}</Context.Provider>;
}
export function useAnalysis() { const context = useContext(Context); if (!context) throw new Error("Analysis provider is missing"); return context; }
