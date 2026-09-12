import { beforeEach, expect, it, vi } from "vitest";
import { propertySchema } from "./schemas";

const disk = vi.hoisted(() => ({ text: "" }));
vi.mock("node:fs", () => ({ promises: { readFile: async () => disk.text } }));
vi.mock("./fs-safe", () => ({
  canAccessLocalFs: () => true,
  safeWriteFile: async (_path: string, text: string) => { disk.text = text; return true; },
}));
import { repo } from "./store";

beforeEach(() => {
  disk.text = JSON.stringify({ version: 1, properties: [propertySchema.parse({
    id: "version-test", category: "studio", cover: {},
    updatedAt: "2026-01-01T00:00:00.000Z",
    splatItems: [{ splatUrl: "/uploads/test.rad" }],
  })] });
});

it("returns the persisted version after automatically filling legacy scan IDs", async () => {
  const opened = await repo.get("version-test");
  const beforeFirstSave = await repo.get("version-test");
  expect(opened?.splatItems[0].id).toBeTruthy();
  expect(opened?.updatedAt).toBe(beforeFirstSave?.updatedAt);
});

it("list returns the persisted version after filling legacy scan IDs", async () => {
  const [listed] = await repo.list();
  expect(listed.updatedAt).toBe((await repo.get("version-test"))?.updatedAt);
});
