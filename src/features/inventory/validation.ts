import { z } from 'zod';
import { ITEM_STATUSES } from '@/domain/types';

/** Shared by forms and inline editors so the rules match everywhere (and match the DB check constraints). */
export const countValue = z
  .string()
  .trim()
  .min(1, 'Enter a count.')
  .max(120, 'Keep counts under 120 characters.');

export const parLevel = z
  .string()
  .trim()
  .transform((v) => (v === '' ? null : Number(v)))
  .refine((v) => v === null || (Number.isFinite(v) && v >= 0 && v <= 100000), 'Par must be a number from 0 to 100,000.');

export const itemSchema = z.object({
  name: z.string().trim().min(1, 'Give the item a name.').max(120, 'Keep the name under 120 characters.'),
  category: z.string().trim().min(1, 'Choose a category.').max(80),
  subcategory: z.string().trim().max(80).transform((v) => v || null),
  unit_type: z.enum(['count', 'percentage', 'freeform']),
  current_value: z.string().trim().max(120, 'Keep counts under 120 characters.').transform((v) => v || null),
  par_level: parLevel,
  par_source_note: z.string().trim().max(200).transform((v) => v || null),
  supplier_id: z.string().transform((v) => (v ? Number(v) : null)),
  status: z.enum(ITEM_STATUSES as unknown as [string, ...string[]]),
  notes: z.string().trim().max(1000, 'Keep notes under 1,000 characters.').transform((v) => v || null),
  location: z.string().trim().max(80, 'Keep the location under 80 characters.').transform((v) => v || null),
  reorder_url: z
    .string()
    .trim()
    .max(500)
    .refine((v) => v === '' || /^https?:\/\/\S+$/i.test(v), 'Use a full web address starting with https://')
    .transform((v) => v || null),
});

export type ItemFormValues = z.input<typeof itemSchema>;

export function fieldErrors(error: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = String(issue.path[0] ?? 'form');
    out[key] ??= issue.message;
  }
  return out;
}

export function validateCount(v: string): string | null {
  const r = countValue.safeParse(v);
  return r.success ? null : r.error.issues[0]!.message;
}

export function validatePar(v: string): string | null {
  const r = parLevel.safeParse(v);
  return r.success ? null : r.error.issues[0]!.message;
}

export function validateLocation(v: string): string | null {
  return v.trim().length > 80 ? 'Keep the location under 80 characters.' : null;
}
