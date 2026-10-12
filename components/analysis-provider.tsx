"use client";
import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import type { AnalyzeResponse } from "@/lib/types";
type AnalysisSession = { file: File | null; preview: string | null; result: AnalyzeResponse | null; setFile: (file: File | null) => void; setResult: (result: AnalyzeResponse | null) => void; clear: () => void };
const Context = createContext<AnalysisSession | null>(null);
export function AnalysisProvider({ children }: { children: ReactNode }) {
  const [file, setFileState] = useState<File | null>(null); const [preview, setPreview] = useState<string | null>(null); const [result, setResult] = useState<AnalyzeResponse | null>(null); const url = useRef<string | null>(null);
  function setFile(next: File | null) { if (url.current) URL.revokeObjectURL(url.current); url.current = next ? URL.createObjectURL(next) : null; setPreview(url.current); setFileState(next); setResult(null); }
  function clear() { setFile(null); }
  useEffect(() => () => { if (url.current) URL.revokeObjectURL(url.current); }, []);
  return <Context.Provider value={{ file, preview, result, setFile, setResult, clear }}>{children}</Context.Provider>;
}
export function useAnalysis() { const context = useContext(Context); if (!context) throw new Error("Analysis provider is missing"); return context; }
