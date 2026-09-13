type Database = {
  prepare(sql: string): {
    bind(...values: (string | number)[]): {
      run(): Promise<{meta?: {changes?: number}}>;
    };
  };
};
type Attachment = {
  propertyId: string;
  sceneId: string;
  expectedJson: string;
  expectedUpdatedAt: string;
  previousUrl: string;
  url: string;
  bytes: number;
  newUpdatedAt: string;
};

// Internal primitive only. Caller must authenticate, verify asset bytes and read back.
export async function attachDraftSceneConditionally(db: Database, input: Attachment): Promise<boolean> {
  const b = {...input};
  if (!b.propertyId || !b.sceneId || !b.expectedUpdatedAt || !b.newUpdatedAt ||
      b.newUpdatedAt === b.expectedUpdatedAt || typeof b.previousUrl !== 'string' ||
      typeof b.expectedJson !== 'string' || b.expectedJson.length > 16 * 1024 ** 2 ||
      !Number.isSafeInteger(b.bytes) || b.bytes <= 0 || b.bytes > 2 * 1024 ** 3 ||
      typeof b.url !== 'string' || !(b.url.startsWith('/assets/') || b.url.startsWith('/api/r2/assets/') || b.url.startsWith('https://'))) {
    throw new Error('Invalid attachment binding');
  }
  const property = JSON.parse(b.expectedJson);
  if (property?.id !== b.propertyId || property.status !== 'draft' ||
      property.updatedAt !== b.expectedUpdatedAt || !Array.isArray(property.splatItems)) {
    throw new Error('Expected the bound draft property');
  }
  const selected = property.splatItems.filter((s: {id?: string} | null) => s?.id === b.sceneId);
  if (selected.length !== 1 || (selected[0].splatUrl || '') !== b.previousUrl) {
    throw new Error('Missing, ambiguous or changed scene');
  }
  selected[0].splatUrl = b.url;
  selected[0].sizeMb = Math.max(1, Math.round(b.bytes / 1024 / 1024));
  property.updatedAt = b.newUpdatedAt;
  // Match the exact raw preimage too: timestamps alone can collide within one millisecond.
  const result = await db.prepare(
    "UPDATE properties SET data = ?, updated_at = ? WHERE id = ? AND status = 'draft' AND updated_at = ? AND data = ?",
  ).bind(JSON.stringify(property), b.newUpdatedAt, b.propertyId, b.expectedUpdatedAt, b.expectedJson).run();
  if (!Number.isInteger(result.meta?.changes) || result.meta!.changes! < 0 || result.meta!.changes! > 1) {
    throw new Error('Database did not confirm the conditional update');
  }
  return result.meta!.changes === 1;
}
