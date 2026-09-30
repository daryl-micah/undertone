"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef } from "react";

export function HeaderSearch() {
  const router = useRouter();
  const ref = useRef<HTMLInputElement>(null);

  // "/" focuses search from anywhere, like most apps with a global search.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (e.key !== "/" || t.closest("input, textarea, select, [contenteditable=true]")) return;
      e.preventDefault();
      ref.current?.focus();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <form
      role="search"
      onSubmit={(e) => {
        e.preventDefault();
        const q = ref.current?.value.trim();
        router.push(q ? `/search?q=${encodeURIComponent(q)}` : "/search");
      }}
      className="ml-auto"
    >
      <input
        ref={ref}
        type="search"
        placeholder="Search meetings  /"
        aria-label="Search meetings"
        className="w-32 rounded-md border border-border bg-bg px-2.5 py-1 text-sm outline-none transition-[width] focus:w-56 focus:border-accent sm:w-44"
      />
    </form>
  );
}
