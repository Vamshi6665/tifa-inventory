import { useEffect, useMemo, useState } from 'react';
import { IconUsers, IconPencil, IconInfoCircle, IconUserCheck, IconUserX } from '@tabler/icons-react';
import { Avatar, Badge, Button, Checkbox, ConfirmDialog, Dialog, EmptyState, PageHeader, Panel, Skeleton } from '@/design-system';
import { useItems, useProfiles, useRejectProfile, useUpdateProfile } from '@/data/hooks';
import { useAuth } from '@/features/auth/AuthProvider';
import { ROLE_DESCRIPTION, ROLE_LABEL } from '@/domain/permissions';
import { formatWhen, relativeTime } from '@/domain/dates';
import type { Role, UserProfile } from '@/domain/types';
import styles from './Team.module.css';

type Editing = { person: UserProfile; approving: boolean };

export default function TeamPage() {
  const profiles = useProfiles();
  const { profile: me } = useAuth();
  const reject = useRejectProfile();
  const [editing, setEditing] = useState<Editing | null>(null);
  const [rejecting, setRejecting] = useState<UserProfile | null>(null);
  const waiting = (profiles.data ?? []).filter((p) => p.pending);
  const team = (profiles.data ?? []).filter((p) => !p.pending);
  const nameOf = (p: UserProfile) => p.display_name ?? p.email;

  return (
    <>
      <PageHeader title="Team" description="Who can sign in, what they can do, and which categories they can see. Access is enforced by the database, not just this screen." />
      <div className={styles.note}>
        <IconInfoCircle aria-hidden="true" />
        <p>When someone signs in for the first time, they wait here until you approve them. Approving gives them a role and the categories they can see.</p>
      </div>
      {profiles.isPending ? (
        <Skeleton height={240} />
      ) : (
        <div className={styles.sections}>
          <Panel id="waiting" padded={false} title={`Waiting for approval${waiting.length ? ` (${waiting.length})` : ''}`}>
            {waiting.length === 0 ? (
              <p className={styles.empty}>No one is waiting right now.</p>
            ) : (
              <ul role="list" className={styles.list}>
                {waiting.map((p) => (
                  <li key={p.user_id} className={styles.person}>
                    <Avatar name={nameOf(p)} size={36} />
                    <div className={styles.who}>
                      <span className={styles.name}>{nameOf(p)}</span>
                      <span className={styles.email}>{p.email}</span>
                    </div>
                    <div className={styles.access}>
                      <Badge tone="warning">Waiting</Badge>
                    </div>
                    <span className={styles.seen}>{p.created_at ? `Asked ${formatWhen(p.created_at)}` : ''}</span>
                    <div className={styles.actions}>
                      <Button size="sm" variant="primary" icon={<IconUserCheck />} onClick={() => setEditing({ person: p, approving: true })} aria-label={`Approve ${nameOf(p)}`}>
                        Approve
                      </Button>
                      <Button size="sm" variant="ghost" icon={<IconUserX />} onClick={() => setRejecting(p)} aria-label={`Turn down ${nameOf(p)}`}>
                        Turn down
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Panel>

          <Panel id="team" padded={false} title="Team">
            {team.length === 0 ? (
              <EmptyState icon={<IconUsers />} title="No one else yet">Ask your team to sign in once; they’ll show up under Waiting for approval.</EmptyState>
            ) : (
              <ul role="list" className={styles.list}>
                {team.map((p) => (
                  <li key={p.user_id} className={styles.person}>
                    <Avatar name={nameOf(p)} size={36} />
                    <div className={styles.who}>
                      <span className={styles.name}>
                        {nameOf(p)}
                        {p.user_id === me?.user_id && <span className={styles.you}> (you)</span>}
                      </span>
                      <span className={styles.email}>{p.email}</span>
                    </div>
                    <div className={styles.access}>
                      <Badge tone={p.role === 'admin' ? 'ok' : p.role === 'staff' ? 'info' : 'neutral'}>{ROLE_LABEL[p.role]}</Badge>
                      <span className={styles.cats}>{p.role === 'admin' || p.categories == null ? 'All categories' : p.categories.length ? p.categories.join(', ') : 'No categories yet'}</span>
                    </div>
                    <span className={styles.seen}>{p.last_seen_at ? `Active ${relativeTime(p.last_seen_at)}` : ''}</span>
                    <Button size="sm" icon={<IconPencil />} onClick={() => setEditing({ person: p, approving: false })} aria-label={`Change access for ${nameOf(p)}`}>
                      Change access
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </div>
      )}
      <AccessDialog editing={editing} isSelf={editing?.person.user_id === me?.user_id} onClose={() => setEditing(null)} />
      <ConfirmDialog
        open={!!rejecting}
        onOpenChange={(o) => !o && setRejecting(null)}
        title={`Turn down ${rejecting ? nameOf(rejecting) : ''}?`}
        description="They won’t get access. If they should have access later, they’ll need a new account."
        confirmLabel="Turn down"
        danger
        loading={reject.isPending}
        onConfirm={() => rejecting && reject.mutate(rejecting.user_id, { onSuccess: () => setRejecting(null) })}
      />
    </>
  );
}

function AccessDialog({ editing, isSelf, onClose }: { editing: Editing | null; isSelf: boolean; onClose: () => void }) {
  const items = useItems();
  const update = useUpdateProfile();
  const categories = useMemo(() => [...new Set((items.data ?? []).map((i) => i.category))].sort(), [items.data]);
  const [role, setRole] = useState<Role>('staff');
  const viewerRole = useAuth().profile?.features?.viewerRole ?? true;
  const [cats, setCats] = useState<string[]>([]);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const person = editing?.person ?? null;
  const approving = editing?.approving ?? false;
  const name = person?.display_name ?? person?.email ?? '';

  useEffect(() => {
    if (!person) return;
    setRole(person.role);
    setCats(person.categories ?? []);
  }, [person]);

  const needsCats = role !== 'admin';
  const save = () =>
    person &&
    update.mutate(
      { userId: person.user_id, patch: { role, categories: needsCats ? cats : null, ...(approving ? { pending: false } : {}) }, success: approving ? `${name} approved` : 'Access updated' },
      { onSuccess: onClose },
    );
  const remove = () =>
    person && update.mutate({ userId: person.user_id, patch: { pending: true }, success: `Removed access for ${name}` }, { onSuccess: () => { setConfirmRemove(false); onClose(); } });

  return (
    <>
      <Dialog
        open={!!person}
        onOpenChange={(o) => !o && onClose()}
        title={approving ? `Approve ${name}` : `Access for ${name}`}
        footer={
          <>
            {!approving && !isSelf && (
              <Button variant="ghost" className={styles.removeBtn} onClick={() => setConfirmRemove(true)}>
                Remove access
              </Button>
            )}
            <Button variant="ghost" onClick={onClose}>Cancel</Button>
            <Button variant="primary" loading={update.isPending} onClick={save} disabled={needsCats && cats.length === 0}>
              {approving ? 'Approve' : 'Save access'}
            </Button>
          </>
        }
      >
        <fieldset className={styles.fieldset}>
          <legend className={styles.legend}>Role</legend>
          {(viewerRole ? (['admin', 'staff', 'viewer'] as Role[]) : (['admin', 'staff'] as Role[])).map((r) => (
            <label key={r} className={styles.radio}>
              <input type="radio" name="role" value={r} checked={role === r} onChange={() => setRole(r)} disabled={isSelf && r !== 'admin'} />
              <span>
                <span className={styles.radioLabel}>{ROLE_LABEL[r]}</span>
                <span className={styles.radioDesc}>{ROLE_DESCRIPTION[r]}</span>
              </span>
            </label>
          ))}
          {isSelf && <p className={styles.hint}>You can’t remove your own admin access. Another admin can.</p>}
        </fieldset>
        {needsCats && (
          <fieldset className={styles.fieldset}>
            <legend className={styles.legend}>Categories</legend>
            <div className={styles.check}>
              <Checkbox
                id="cat-all"
                label="Every category"
                checked={categories.length > 0 && cats.length === categories.length}
                indeterminate={cats.length > 0 && cats.length < categories.length}
                onChange={(on) => setCats(on ? categories : [])}
              />
              <label htmlFor="cat-all">Every category</label>
            </div>
            <div className={styles.catGrid}>
              {categories.map((c) => (
                <div key={c} className={styles.check}>
                  <Checkbox id={`cat-${c}`} label={c} checked={cats.includes(c)} onChange={(on) => setCats((s) => (on ? [...s, c] : s.filter((x) => x !== c)))} />
                  <label htmlFor={`cat-${c}`}>{c}</label>
                </div>
              ))}
            </div>
            {cats.length === 0 && <p className={styles.hint}>Choose at least one category.</p>}
            <p className={styles.hint}>New categories aren’t added automatically; come back here to grant them.</p>
          </fieldset>
        )}
      </Dialog>
      <ConfirmDialog
        open={confirmRemove}
        onOpenChange={setConfirmRemove}
        title={`Remove access for ${name}?`}
        description="They’ll go back to waiting for approval and won’t see any inventory until an admin approves them again."
        confirmLabel="Remove access"
        danger
        loading={update.isPending}
        onConfirm={remove}
      />
    </>
  );
}
