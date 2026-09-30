import type { Metadata } from "next";
import Link from "next/link";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Undertone",
  description: "Meeting recordings, transcripts, summaries and highlights.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col font-sans">
        <header className="sticky top-0 z-10 border-b border-border bg-surface/90 backdrop-blur">
          <div className="mx-auto flex h-14 max-w-6xl items-center gap-6 px-4">
            <Link href="/" className="flex items-center gap-2 font-semibold tracking-tight">
              <span aria-hidden className="grid h-6 w-6 place-items-center rounded-md bg-accent text-xs text-white">
                u
              </span>
              Undertone
            </Link>
            <nav className="flex items-center gap-4 whitespace-nowrap text-sm text-muted">
              <Link href="/" className="hover:text-text">
                Meetings
              </Link>
              <Link href="/action-items" className="hover:text-text">
                Action items
              </Link>
            </nav>
            <span className="ml-auto hidden rounded-full border border-border px-2.5 py-0.5 text-xs text-muted sm:inline">
              Demo workspace
            </span>
          </div>
        </header>
        <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8">{children}</main>
      </body>
    </html>
  );
}
