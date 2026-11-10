/**
 * Hard delete with referential safety: refuses (409) when other records still point at the row, naming what blocks it,
 * so the admin can clean up or deactivate instead. Rows that are safe to cascade are listed per entity below.
 */
import { sql } from 'drizzle-orm';
import { db } from '../db/index.js';
import { AppError, notFound } from './errors.js';

const rows = (r) => r.rows || r;

/** blockers: [{ table, column, label }] — counted; if any > 0 the delete is refused. */
export async function assertDeletable(entityLabel, id, blockers) {
  const found = [];
  for (const b of blockers) {
    const [{ n }] = rows(await db.execute(sql`SELECT count(*)::int AS n FROM ${sql.raw(b.table)} WHERE ${sql.raw(b.column)} = ${id} ${b.where ? sql.raw(' AND ' + b.where) : sql``}`));
    if (n > 0) found.push(`${n} ${b.label}`);
  }
  if (found.length) throw new AppError(409, 'HAS_REFERENCES', `Cannot delete this ${entityLabel}: still linked to ${found.join(', ')}. Remove or reassign them first, or deactivate instead.`, { blockers: found });
}

export async function deleteRow(table, id, companyId) {
  const r = rows(await db.execute(sql`DELETE FROM ${sql.raw(table)} WHERE id = ${id} AND company_id = ${companyId} RETURNING id`));
  if (!r.length) throw notFound('Record');
  return r[0];
}
