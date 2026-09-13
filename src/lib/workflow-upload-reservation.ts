type Statement = {
  run(): Promise<unknown>;
  first(): Promise<Record<string, unknown> | null>;
};
type Database = {prepare(sql: string): {bind(...values: (string | number)[]): Statement}};
type UploadAsset = {
  id: string; kind: string; status: string; filename: string; r2Key: string;
  size: number; contentType: string; uploadedAt: string; [key: string]: unknown;
};

// Internal only: caller supplies an authenticated, source/property/scene-bound job key.
export async function reserveWorkflowUpload(db: Database, request: {key: string; binding: string; asset: UploadAsset}) {
  const {key, binding} = request, asset = structuredClone(request.asset);
  if (!/^[a-f0-9]{64}$/.test(key) || typeof binding !== 'string' || !binding || binding.length > 8192 ||
      asset.id !== 'wf_' + key || asset.kind !== 'splat' || asset.status !== 'uploading' ||
      !asset.filename.endsWith('.zip') || !asset.r2Key.startsWith('assets/splat/') ||
      !Number.isSafeInteger(asset.size) || asset.size < 1 || asset.size > 2 * 1024 ** 3) {
    throw new Error('Invalid workflow upload reservation');
  }
  await db.prepare('INSERT INTO workflow_uploads(job_key,binding,asset_id) VALUES(?,?,?) ON CONFLICT(job_key) DO NOTHING')
    .bind(key,binding,asset.id).run();
  const reservation = await db.prepare('SELECT binding,asset_id FROM workflow_uploads WHERE job_key=?').bind(key).first();
  if (reservation?.binding !== binding || reservation.asset_id !== asset.id) throw new Error('Workflow upload binding mismatch');
  // An interrupted reservation is safe to repeat; never UPSERT over a ready asset.
  await db.prepare('INSERT INTO assets(id,kind,status,uploaded_at,data) VALUES(?,?,?,?,?) ON CONFLICT(id) DO NOTHING')
    .bind(asset.id,asset.kind,asset.status,asset.uploadedAt,JSON.stringify(asset)).run();
  const row = await db.prepare('SELECT data FROM assets WHERE id=?').bind(asset.id).first();
  if (typeof row?.data !== 'string') throw new Error('Reserved asset missing');
  const saved = JSON.parse(row.data) as UploadAsset;
  for (const field of ['id','kind','filename','r2Key','size','contentType'] as const) {
    if (saved[field] !== asset[field]) throw new Error('Reserved asset metadata mismatch');
  }
  if (!['uploading','ready'].includes(saved.status)) throw new Error('Reserved asset unavailable');
  return saved;
}
