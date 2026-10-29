import { forwardRef, useId, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react';
import { IconSearch, IconX, IconChevronDown, IconCheck, IconMinus } from '@tabler/icons-react';
import styles from './Field.module.css';
import { cx } from '@/lib/cx';

interface FieldShellProps {
  label?: ReactNode;
  hint?: ReactNode;
  error?: string | null;
  required?: boolean;
  hideLabel?: boolean;
  className?: string;
}

function useFieldIds(id?: string) {
  const auto = useId();
  const fieldId = id ?? auto;
  return { fieldId, hintId: `${fieldId}-hint`, errorId: `${fieldId}-error` };
}

function Shell({ label, hint, error, required, hideLabel, className, fieldId, hintId, errorId, children }: FieldShellProps & { fieldId: string; hintId: string; errorId: string; children: ReactNode }) {
  return (
    <div className={cx(styles.field, className)}>
      {label && (
        <label htmlFor={fieldId} className={cx(styles.label, hideLabel && 'sr-only')}>
          {label}
          {required && <span className={styles.required} aria-hidden="true"> *</span>}
        </label>
      )}
      {children}
      {hint && !error && <p id={hintId} className={styles.hint}>{hint}</p>}
      {error && (
        <p id={errorId} className={styles.error} role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

export interface TextFieldProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'size' | 'prefix'>, FieldShellProps {
  prefix?: ReactNode;
  suffix?: ReactNode;
}

export const TextField = forwardRef<HTMLInputElement, TextFieldProps>(function TextField({ label, hint, error, required, hideLabel, className, prefix, suffix, id, ...rest }, ref) {
  const ids = useFieldIds(id);
  return (
    <Shell {...{ label, hint, error, required, hideLabel, className }} {...ids}>
      <div className={cx(styles.control, error && styles.invalid, rest.disabled && styles.disabled)}>
        {prefix && <span className={styles.affix}>{prefix}</span>}
        <input
          ref={ref}
          id={ids.fieldId}
          className={styles.input}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? ids.errorId : hint ? ids.hintId : undefined}
          required={required}
          {...rest}
        />
        {suffix && <span className={styles.affix}>{suffix}</span>}
      </div>
    </Shell>
  );
});

export const TextArea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement> & FieldShellProps>(function TextArea({ label, hint, error, required, hideLabel, className, id, ...rest }, ref) {
  const ids = useFieldIds(id);
  return (
    <Shell {...{ label, hint, error, required, hideLabel, className }} {...ids}>
      <textarea
        ref={ref}
        id={ids.fieldId}
        className={cx(styles.control, styles.textarea, error && styles.invalid)}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? ids.errorId : hint ? ids.hintId : undefined}
        required={required}
        {...rest}
      />
    </Shell>
  );
});

export interface SelectFieldProps extends Omit<SelectHTMLAttributes<HTMLSelectElement>, 'size'>, FieldShellProps {
  options: Array<{ value: string; label: string; disabled?: boolean }>;
  placeholder?: string;
  size?: 'sm' | 'md';
}

/** Native select: best screen-reader and mobile behaviour, styled to match. */
export const SelectField = forwardRef<HTMLSelectElement, SelectFieldProps>(function SelectField({ label, hint, error, required, hideLabel, className, options, placeholder, id, size = 'md', ...rest }, ref) {
  const ids = useFieldIds(id);
  return (
    <Shell {...{ label, hint, error, required, hideLabel, className }} {...ids}>
      <div className={cx(styles.control, styles.selectWrap, size === 'sm' && styles.sm, error && styles.invalid)}>
        <select
          ref={ref}
          id={ids.fieldId}
          className={styles.select}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? ids.errorId : hint ? ids.hintId : undefined}
          required={required}
          {...rest}
        >
          {placeholder != null && <option value="">{placeholder}</option>}
          {options.map((o) => (
            <option key={o.value} value={o.value} disabled={o.disabled}>
              {o.label}
            </option>
          ))}
        </select>
        <IconChevronDown className={styles.chevron} aria-hidden="true" />
      </div>
    </Shell>
  );
});

export function SearchInput({ value, onChange, placeholder = 'Search', label = 'Search', className, inputRef, shortcut, size = 'md' }: { value: string; onChange: (v: string) => void; placeholder?: string; label?: string; className?: string; inputRef?: React.Ref<HTMLInputElement>; shortcut?: ReactNode; size?: 'sm' | 'md' }) {
  return (
    <div className={cx(styles.control, styles.search, size === 'sm' && styles.sm, className)}>
      <IconSearch className={styles.searchIcon} aria-hidden="true" />
      <input
        ref={inputRef}
        type="search"
        className={styles.input}
        value={value}
        placeholder={placeholder}
        aria-label={label}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Escape' && value) {
            e.stopPropagation();
            onChange('');
          }
        }}
      />
      {value ? (
        <button type="button" className={styles.clear} onClick={() => onChange('')} aria-label="Clear search">
          <IconX aria-hidden="true" />
        </button>
      ) : (
        shortcut && <span className={styles.affix}>{shortcut}</span>
      )}
    </div>
  );
}

export function Checkbox({ checked, indeterminate, onChange, label, className, disabled, id }: { checked: boolean; indeterminate?: boolean; onChange: (checked: boolean, shift: boolean) => void; label: string; className?: string; disabled?: boolean; id?: string }) {
  return (
    <span className={cx(styles.checkbox, className)}>
      <input
        type="checkbox"
        id={id}
        checked={checked}
        disabled={disabled}
        aria-label={label}
        aria-checked={indeterminate ? 'mixed' : checked}
        ref={(el) => {
          if (el) el.indeterminate = !!indeterminate;
        }}
        onChange={(e) => onChange(e.target.checked, (e.nativeEvent as MouseEvent).shiftKey)}
        onClick={(e) => e.stopPropagation()}
      />
      <span className={styles.checkboxBox} aria-hidden="true">
        {indeterminate ? <IconMinus /> : checked ? <IconCheck /> : null}
      </span>
    </span>
  );
}
