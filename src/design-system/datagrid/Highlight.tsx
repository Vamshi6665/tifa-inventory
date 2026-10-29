import { createContext, useContext } from 'react';
import { highlight } from '@/domain/search';

export const GridSearchContext = createContext('');

/** Renders text with search matches marked. Pure text nodes — never HTML. */
export function Highlight({ text, query }: { text: string | null | undefined; query?: string }) {
  const ctx = useContext(GridSearchContext);
  const q = query ?? ctx;
  if (!text) return null;
  if (!q.trim()) return <>{text}</>;
  return (
    <>
      {highlight(text, q).map((s, i) => (s.match ? <mark key={i}>{s.text}</mark> : <span key={i}>{s.text}</span>))}
    </>
  );
}
