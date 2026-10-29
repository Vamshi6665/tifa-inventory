import { useEffect, useRef, useState, type ReactNode } from 'react';
import { IconPencil } from '@tabler/icons-react';
import type { EditorConfig } from './types';
import styles from './DataGrid.module.css';

interface Props<T> {
  row: T;
  value: string;
  label: string;
  config: EditorConfig<T>;
  display: ReactNode;
  onCommit: (value: string) => void | Promise<void>;
}

/**
 * Click the value (or press Enter on the pencil) to edit in place.
 * Enter saves, Escape cancels, Tab saves and moves on. The pencil is always
 * visible so the affordance doesn't depend on hover.
 */
export function EditableCell<T>({ row, value, label, config, display, onCommit }: Props<T>) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement & HTMLSelectElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const allowed = config.canEdit ? config.canEdit(row) : true;

  useEffect(() => {
    if (editing) {
      inputRef.current?.focus();
      if (inputRef.current && 'select' in inputRef.current && config.type !== 'select') inputRef.current.select();
    }
  }, [editing, config.type]);

  if (!allowed) return <>{display}</>;

  const start = () => {
    setDraft(config.initial ? config.initial(row) : value);
    setError(null);
    setEditing(true);
  };
  const cancel = () => {
    setEditing(false);
    setError(null);
    requestAnimationFrame(() => triggerRef.current?.focus());
  };
  const commit = (refocus = true) => {
    const next = draft.trim();
    if (next === (config.initial ? config.initial(row) : value).trim()) return cancel();
    const problem = config.validate?.(next, row) ?? null;
    if (problem) {
      setError(problem);
      inputRef.current?.focus();
      return;
    }
    setEditing(false);
    void onCommit(next);
    if (refocus) requestAnimationFrame(() => triggerRef.current?.focus());
  };

  if (editing) {
    const common = {
      'aria-label': `Edit ${label}`,
      'aria-invalid': error ? true : undefined,
      'aria-describedby': error ? 'cell-edit-error' : undefined,
      onClick: (e: React.MouseEvent) => e.stopPropagation(),
      onKeyDown: (e: React.KeyboardEvent) => {
        e.stopPropagation();
        if (e.key === 'Enter') {
          e.preventDefault();
          commit();
        } else if (e.key === 'Escape') {
          e.preventDefault();
          cancel();
        }
      },
      onBlur: () => commit(false),
      className: styles.editor,
    };
    return (
      <span className={styles.editWrap}>
        {config.type === 'select' ? (
          <select ref={inputRef} value={draft} onChange={(e) => setDraft(e.target.value)} {...common}>
            {config.options?.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        ) : (
          <input ref={inputRef} value={draft} inputMode={config.type === 'number' ? 'decimal' : undefined} placeholder={config.placeholder} onChange={(e) => setDraft(e.target.value)} maxLength={120} {...common} />
        )}
        {error && (
          <span id="cell-edit-error" role="alert" className={styles.editError}>
            {error}
          </span>
        )}
      </span>
    );
  }

  return (
    <span className={styles.editable}>
      <span className={styles.editDisplay}>{display}</span>
      <button
        ref={triggerRef}
        type="button"
        className={styles.editButton}
        aria-label={`Edit ${label}`}
        title={`Edit ${label}`}
        onClick={(e) => {
          e.stopPropagation();
          start();
        }}
        onKeyDown={(e) => e.stopPropagation()}
      >
        <IconPencil aria-hidden="true" />
      </button>
    </span>
  );
}
