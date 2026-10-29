import { useEffect, type ReactNode } from 'react';
import styles from './PageHeader.module.css';

/**
 * Every page starts here: sets the document title and gives the page its single h1.
 */
export function PageHeader({ title, description, actions, meta }: { title: string; description?: ReactNode; actions?: ReactNode; meta?: ReactNode }) {
  useEffect(() => {
    document.title = `${title} | Tifa Inventory`;
  }, [title]);
  return (
    <header className={styles.header}>
      <div className={styles.text}>
        <h1 className={styles.title} id="page-title" tabIndex={-1}>
          {title}
        </h1>
        {description && <p className={styles.description}>{description}</p>}
        {meta && <div className={styles.meta}>{meta}</div>}
      </div>
      {actions && <div className={styles.actions}>{actions}</div>}
    </header>
  );
}
