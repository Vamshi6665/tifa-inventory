import type { ReactNode } from 'react';
import type { RowData } from '@tanstack/react-table';
import type { Cell } from '@/lib/csv';

export interface EditorConfig<TData> {
  type: 'text' | 'number' | 'select';
  options?: Array<{ value: string; label: string }>;
  placeholder?: string;
  /** Return an error message to block the save. */
  validate?: (value: string, row: TData) => string | null;
  canEdit?: (row: TData) => boolean;
  /** Value to start editing from (defaults to the cell value). */
  initial?: (row: TData) => string;
}

declare module '@tanstack/react-table' {
  interface ColumnMeta<TData extends RowData, TValue> {
    /** Plain-text name for menus, filters and exports. */
    label?: string;
    align?: 'left' | 'right' | 'center';
    filter?: 'select';
    filterLabel?: (value: string) => string;
    exportValue?: (row: TData) => Cell;
    searchable?: boolean;
    /** Value used for search when it differs from the accessor. */
    searchValue?: (row: TData) => string;
    sticky?: boolean;
    editable?: EditorConfig<TData>;
    /** Never hide or reorder (selection, primary name). */
    locked?: boolean;
    _value?: TValue;
  }
}

export interface BulkContext<TData> {
  rows: TData[];
  clear: () => void;
}

export interface GridEmpty {
  title: string;
  body?: ReactNode;
  action?: ReactNode;
  icon?: ReactNode;
}
