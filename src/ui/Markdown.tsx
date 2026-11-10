'use client';

import DOMPurify from 'dompurify';
import { marked } from 'marked';
import { useMemo } from 'react';
import { cx } from './kit';

marked.setOptions({ gfm: true, breaks: true });

const WIKI = /\[\[([^\]\n]{1,120})\]\]/g;

/** Titles referenced with [[Title]] (or [[Title|label]]) in a note body. */
export function wikiLinks(text: string | undefined | null): string[] {
  const out = new Set<string>();
  for (const m of (text ?? '').matchAll(WIKI)) out.add(m[1].split('|')[0].trim());
  return [...out];
}

const escapeHtml = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

/**
 * Markdown → sanitised HTML (marked + DOMPurify). User content is never injected unsanitised.
 * [[Wiki links]] become buttons; `exists(title)` decides whether they render as live or missing.
 */
export function Markdown({ text, className, onWikiLink, exists }: { text: string; className?: string; onWikiLink?: (title: string) => void; exists?: (title: string) => boolean }) {
  const html = useMemo(() => {
    const withLinks = (text ?? '').replace(WIKI, (_, inner: string) => {
      const [title, label] = inner.split('|').map((s) => s.trim());
      const missing = exists ? !exists(title) : false;
      return `<a href="#" data-wiki="${escapeHtml(title)}" class="${missing ? 'wiki-missing' : 'wiki'}">${escapeHtml(label || title)}</a>`;
    });
    const raw = marked.parse(withLinks, { async: false }) as string;
    return DOMPurify.sanitize(raw, { ADD_ATTR: ['data-wiki', 'target'], FORBID_TAGS: ['style', 'form', 'iframe', 'object', 'embed'], FORBID_ATTR: ['style', 'onerror', 'onclick'] })
      .replace(/<a (?![^>]*data-wiki)/g, '<a target="_blank" rel="noopener noreferrer" ');
  }, [text, exists]);
  return (
    <div
      className={cx('prose-note [&_.wiki-missing]:!text-faint [&_.wiki-missing]:decoration-dashed', className)}
      onClick={(e) => {
        const a = (e.target as HTMLElement).closest('a[data-wiki]');
        if (a) {
          e.preventDefault();
          onWikiLink?.(a.getAttribute('data-wiki')!);
        }
      }}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
