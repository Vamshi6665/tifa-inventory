import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Button, Dialog, SelectField, TextArea, TextField } from '@/design-system';
import { useCreateItem, useSuppliers, useUpdateItems } from '@/data/hooks';
import { useAuth } from '@/features/auth/AuthProvider';
import { ITEM_STATUSES, STATUS_LABEL, type InventoryItem } from '@/domain/types';
import { fieldErrors, itemSchema, type ItemFormValues } from './validation';
import styles from './Inventory.module.css';

const blank: ItemFormValues = { name: '', category: '', subcategory: '', unit_type: 'count', current_value: '', par_level: '', par_source_note: '', supplier_id: '', status: 'active', notes: '', location: '', reorder_url: '' };

function fromItem(i: InventoryItem): ItemFormValues {
  return {
    name: i.name,
    category: i.category,
    subcategory: i.subcategory ?? '',
    unit_type: i.unit_type,
    current_value: i.current_value ?? '',
    par_level: i.par_level == null ? '' : String(i.par_level),
    par_source_note: i.par_source_note ?? '',
    supplier_id: i.supplier_id == null ? '' : String(i.supplier_id),
    status: i.status,
    notes: i.notes ?? '',
    location: i.location ?? '',
    reorder_url: i.reorder_url ?? '',
  };
}

export function ItemFormDialog({ open, onOpenChange, item, existing = [] }: { open: boolean; onOpenChange: (o: boolean) => void; item?: InventoryItem; existing?: InventoryItem[] }) {
  const [values, setValues] = useState<ItemFormValues>(item ? fromItem(item) : blank);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const suppliers = useSuppliers();
  const { can } = useAuth();
  const create = useCreateItem();
  const update = useUpdateItems();
  const categories = useMemo(() => [...new Set(existing.map((i) => i.category))].sort(), [existing]);
  const groups = useMemo(() => [...new Set(existing.filter((i) => i.category === values.category).map((i) => i.subcategory).filter(Boolean) as string[])].sort(), [existing, values.category]);

  useEffect(() => {
    if (open) {
      setValues(item ? fromItem(item) : blank);
      setErrors({});
    }
  }, [open, item]);

  const set = <K extends keyof ItemFormValues>(k: K, v: ItemFormValues[K]) => setValues((s) => ({ ...s, [k]: v }));

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const parsed = itemSchema.safeParse(values);
    if (!parsed.success) {
      setErrors(fieldErrors(parsed.error));
      requestAnimationFrame(() => document.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus());
      return;
    }
    const data = parsed.data as Omit<InventoryItem, 'id' | 'updated_at' | 'last_verified_at' | 'supplier' | 'unit_label'>;
    if (item) {
      const { current_value: _cv, ...meta } = data;
      update.mutate({ ids: [item.id], patch: meta, message: `${data.name} saved` }, { onSuccess: () => onOpenChange(false) });
    } else {
      create.mutate(data, { onSuccess: () => onOpenChange(false) });
    }
  };

  const busy = create.isPending || update.isPending;
  const formId = item ? `edit-item-${item.id}` : 'new-item';

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={item ? `Edit ${item.name}` : 'Add an item'}
      description={item ? 'Changes are recorded in the activity log.' : 'Only the name and category are required.'}
      size="lg"
      footer={
        <>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="submit" form={formId} variant="primary" loading={busy}>
            {item ? 'Save changes' : 'Add item'}
          </Button>
        </>
      }
    >
      <form id={formId} onSubmit={submit} className={styles.formGrid} noValidate>
                <TextField className={styles.full} label="Name" value={values.name} onChange={(e) => set('name', e.target.value)} error={errors.name} required maxLength={120} data-autofocus />
        <TextField label="Category" value={values.category} onChange={(e) => set('category', e.target.value)} error={errors.category} required list="category-options" hint="Pick an existing one or type a new one." />
        <datalist id="category-options">
          {categories.map((c) => (
            <option key={c} value={c} />
          ))}
        </datalist>
        <TextField label="Group" value={values.subcategory} onChange={(e) => set('subcategory', e.target.value)} error={errors.subcategory} list="group-options" hint="Used for reorder schedules." />
        <datalist id="group-options">
          {groups.map((g) => (
            <option key={g} value={g} />
          ))}
        </datalist>
        {!item && <TextField label="Current count" value={values.current_value} onChange={(e) => set('current_value', e.target.value)} error={errors.current_value} placeholder="e.g. 12, 50%, or 2 boxes" />}
        <SelectField
          label="Counted as"
          value={values.unit_type}
          onChange={(e) => set('unit_type', e.target.value as ItemFormValues['unit_type'])}
          options={[
            { value: 'count', label: 'A number' },
            { value: 'percentage', label: 'A percentage' },
            { value: 'freeform', label: 'Free text' },
          ]}
        />
        <TextField label="Par level" value={values.par_level} onChange={(e) => set('par_level', e.target.value)} error={errors.par_level} inputMode="decimal" hint="Reorder when stock is at or below this." />
        <TextField label="Where the par came from" value={values.par_source_note} onChange={(e) => set('par_source_note', e.target.value)} error={errors.par_source_note} placeholder="Optional" />
        {can('purchasing:view') && (
          <SelectField label="Supplier" value={values.supplier_id} onChange={(e) => set('supplier_id', e.target.value)} placeholder="No supplier" options={(suppliers.data ?? []).map((s) => ({ value: String(s.id), label: s.name }))} />
        )}
        <SelectField label="Status" value={values.status} onChange={(e) => set('status', e.target.value)} options={ITEM_STATUSES.map((s) => ({ value: s, label: STATUS_LABEL[s] }))} />
        <TextField label="Location" value={values.location} onChange={(e) => set('location', e.target.value)} error={errors.location} maxLength={80} placeholder="e.g. Back freezer" />
        <TextField label="Reorder link" type="url" inputMode="url" value={values.reorder_url} onChange={(e) => set('reorder_url', e.target.value)} error={errors.reorder_url} placeholder="https://" hint="The supplier page for this exact product." />
        <TextArea className={styles.full} label="Notes" value={values.notes} onChange={(e) => set('notes', e.target.value)} error={errors.notes} maxLength={1000} rows={3} />
      </form>
    </Dialog>
  );
}
