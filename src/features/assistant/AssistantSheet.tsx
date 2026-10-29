import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link } from 'react-router';
import { IconSend, IconSparkles } from '@tabler/icons-react';
import { Dialog, Button, Spinner } from '@/design-system';
import { useData } from '@/data/DataProvider';
import { useCountsByItem, useItems, useSuppliers } from '@/data/hooks';
import { useRestock } from '@/data/derived';
import { answerLocally, SUGGESTED_QUESTIONS, type Answer } from './localAssistant';
import styles from './Assistant.module.css';

interface Message {
  id: number;
  role: 'user' | 'assistant';
  text: string;
  answer?: Answer;
}

export function AssistantSheet({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const data = useData();
  const items = useItems();
  const { map } = useCountsByItem();
  const suppliers = useSuppliers();
  const { suggestions } = useRestock();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);
  const idRef = useRef(1);

  useEffect(() => endRef.current?.scrollIntoView({ block: 'end' }), [messages, busy]);

  const ask = async (question: string) => {
    const q = question.trim();
    if (!q || busy) return;
    setInput('');
    setMessages((m) => [...m, { id: idRef.current++, role: 'user', text: q }]);
    setBusy(true);
    const ctx = { items: items.data ?? [], counts: map, suggestions, suppliers: suppliers.data ?? [] };
    let answer: Answer = answerLocally(q, ctx);
    if (data.kind === 'supabase' && data.getAccessToken) {
      try {
        const token = await data.getAccessToken();
        const res = await fetch('/api/assistant', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify({ question: q }) });
        if (res.ok) {
          const body = (await res.json()) as { text: string };
          answer = { text: body.text, items: answer.items, source: 'claude' };
        }
      } catch {
        /* network or not deployed: keep the local answer */
      }
    }
    setMessages((m) => [...m, { id: idRef.current++, role: 'assistant', text: answer.text, answer }]);
    setBusy(false);
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    void ask(input);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange} variant="sheet" title="Ask about your inventory" description="Answers come only from your items, counts and suppliers.">
      <div className={styles.wrap}>
        <div className={styles.log} role="log" aria-live="polite" aria-label="Conversation">
          {messages.length === 0 && (
            <div className={styles.intro}>
              <IconSparkles aria-hidden="true" className={styles.introIcon} />
              <p>Try one of these, or ask in your own words.</p>
              <ul role="list" className={styles.chips}>
                {SUGGESTED_QUESTIONS.map((s) => (
                  <li key={s}>
                    <button type="button" className={styles.chip} onClick={() => void ask(s)}>
                      {s}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {messages.map((m) => (
            <div key={m.id} className={m.role === 'user' ? styles.user : styles.bot}>
              <span className="sr-only">{m.role === 'user' ? 'You asked:' : 'Answer:'}</span>
              <p className={styles.text}>{m.text}</p>
              {m.answer?.items && m.answer.items.length > 0 && (
                <ul role="list" className={styles.items}>
                  {m.answer.items.map((i) => (
                    <li key={i.id}>
                      <Link to={`/inventory/${i.id}`} className={styles.item} onClick={() => onOpenChange(false)}>
                        <span className={styles.itemName}>{i.name}</span>
                        <span className={styles.itemDetail}>{i.detail}</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
              {m.answer && <span className={styles.source}>{m.answer.source === 'claude' ? 'Answered by Claude from your data' : 'Calculated from your data'}</span>}
            </div>
          ))}
          {busy && (
            <div className={styles.bot}>
              <Spinner size={14} label="Working on it" />
            </div>
          )}
          <div ref={endRef} />
        </div>
        <form onSubmit={submit} className={styles.form}>
          <label htmlFor="assistant-input" className="sr-only">
            Your question
          </label>
          <input id="assistant-input" className={styles.input} value={input} onChange={(e) => setInput(e.target.value)} placeholder="e.g. What should I order from Northbay?" maxLength={500} autoComplete="off" />
          <Button type="submit" variant="primary" icon={<IconSend />} disabled={!input.trim() || busy} aria-label="Ask" />
        </form>
      </div>
    </Dialog>
  );
}
