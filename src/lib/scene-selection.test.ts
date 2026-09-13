import { expect, it } from "vitest";
import { sceneIndexForId } from "./scene-selection";

it("selects the requested ID within the already-visible scenes", () => {
  expect(sceneIndexForId(["first", "second"], "second")).toBe(1);
});
it("does not recover an omitted restricted scene from an original array index", () => {
  expect(sceneIndexForId(["first", "second"], "restricted")).toBe(0);
});
it("uses the first visible scene for absent, stale, or empty selection", () => {
  expect(sceneIndexForId(["first"], undefined)).toBe(0);
  expect(sceneIndexForId(["first"], "removed")).toBe(0);
  expect(sceneIndexForId([], "second")).toBe(0);
});
