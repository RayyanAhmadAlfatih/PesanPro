'use client';

import { useEffect, useRef } from "react";

type CopyableDocsArticleProps = {
  html: string;
  className?: string;
};

const RESET_LABEL_MS = 2_000;

/**
 * Render a rendered-markdown article and give every code block a copy button.
 *
 * The guide HTML comes from the server, so the button is injected on the
 * client: server rendering stays static, and re-visits decorate instantly.
 */
export function CopyableDocsArticle({ html, className }: CopyableDocsArticleProps) {
  const articleRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const root = articleRef.current;
    if (!root) return;
    const cleanups: Array<() => void> = [];

    for (const pre of Array.from(root.querySelectorAll("pre"))) {
      if (pre.dataset.copyReady === "true") continue;
      pre.dataset.copyReady = "true";

      const button = document.createElement("button");
      button.type = "button";
      button.className = "pp-copy-button";
      button.textContent = "Salin";
      button.setAttribute("aria-label", "Salin kode ke papan klip");

      let resetTimer = 0;
      const onClick = () => {
        const text = pre.querySelector("code")?.textContent ?? pre.textContent ?? "";
        void navigator.clipboard.writeText(text).then(() => {
          button.textContent = "Tersalin";
        }, () => {
          button.textContent = "Gagal salin";
        }).finally(() => {
          window.clearTimeout(resetTimer);
          resetTimer = window.setTimeout(() => {
            button.textContent = "Salin";
          }, RESET_LABEL_MS);
        });
      };
      button.addEventListener("click", onClick);
      pre.appendChild(button);
      cleanups.push(() => {
        button.removeEventListener("click", onClick);
        window.clearTimeout(resetTimer);
      });
    }

    return () => {
      for (const cleanup of cleanups) cleanup();
    };
  }, [html]);

  return (
    <article
      ref={articleRef}
      className={className}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
