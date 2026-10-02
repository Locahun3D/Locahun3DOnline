import { expect, it } from "vitest";
import { displaySceneSizeMb } from "./scene-size";

it("shows the stream size after an online edit replaced the scene with a small archive", () => {
  expect(displaySceneSizeMb({ sizeMb: 1, streamUrl: "/api/r2/assets/splat/x.zip", streamSizeMb: 516 })).toBe(516);
});

it("keeps the scene size when there is no stream", () => {
  expect(displaySceneSizeMb({ sizeMb: 125 })).toBe(125);
  expect(displaySceneSizeMb({ sizeMb: 125, streamSizeMb: 999 })).toBe(125);
});
