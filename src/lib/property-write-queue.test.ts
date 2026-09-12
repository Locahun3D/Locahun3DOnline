import { expect, it } from "vitest";
import { createPropertyWriteQueue } from "./property-write-queue";

it("waits for an in-flight save before publication and reads later edits only when their save starts", async () => {
  const enqueue = createPropertyWriteQueue();
  let release!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  const calls: string[] = [];
  let version = "v0";
  let title = "initial";
  const draft = enqueue(async () => { calls.push(`draft:${version}`); await gate; version = "v1"; });
  const publish = enqueue(async () => { calls.push(`publish:${version}`); version = "v2"; });
  const later = enqueue(async () => { calls.push(`later:${version}:${title}`); });
  await Promise.resolve();
  expect(calls).toEqual(["draft:v0"]);
  title = "typed while publishing";
  release();
  await Promise.all([draft, publish, later]);
  expect(calls).toEqual(["draft:v0", "publish:v1", "later:v2:typed while publishing"]);
});

it("keeps the queue usable after a failed request", async () => {
  const enqueue = createPropertyWriteQueue();
  await expect(enqueue(async () => { throw new Error("offline"); })).rejects.toThrow("offline");
  await expect(enqueue(async () => "retried")).resolves.toBe("retried");
});

it("does not publish already queued work after the preceding save fails", async () => {
  const enqueue = createPropertyWriteQueue();
  let published = false;
  const failedSave = enqueue(async () => { throw new Error("offline"); });
  const publish = enqueue(async () => { published = true; });
  await expect(failedSave).rejects.toThrow("offline");
  await expect(publish).rejects.toThrow("直前の保存");
  expect(published).toBe(false);
});
