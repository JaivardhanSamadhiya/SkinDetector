import type { Metadata } from "next";
import "@fontsource/dm-sans/400.css";
import "@fontsource/dm-sans/500.css";
import "@fontsource/dm-sans/600.css";
import "@fontsource/dm-sans/700.css";
import "@fontsource/lora/400.css";
import "@fontsource/lora/500.css";
import "./globals.css";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { AnalysisProvider } from "@/components/analysis-provider";
export const metadata: Metadata = { title: { default: "SkinSnap — Skin understanding, thoughtfully designed", template: "%s | SkinSnap" }, description: "Explore skin health education and transparent dermoscopic image analysis. A student research project, not a medical diagnosis." };
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) { return <html lang="en"><body><a className="skip-link" href="#main">Skip to content</a><AnalysisProvider><SiteHeader/><main id="main">{children}</main><SiteFooter/></AnalysisProvider></body></html>; }
