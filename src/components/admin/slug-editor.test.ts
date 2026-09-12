import { expect, it, vi } from "vitest";
import type { ReactElement, ReactNode } from "react";

const state = vi.hoisted(() => ({ pending: [] as Promise<unknown>[] }));
vi.mock("react", async (original) => ({
  ...await original<typeof import("react")>(),
  useState: (value: unknown) => [value, () => {}],
  useActionState: () => [undefined, () => {}, false],
  useTransition: () => [false, (run: () => Promise<unknown>) => { state.pending.push(run()); }],
}));
vi.mock("@/app/admin/_actions", () => ({
  renamePropertyAction: vi.fn(),
  confirmPropertySlugAction: vi.fn(async () => ({ ok: true, confirmedAt: "2026-09-12T00:00:00.000Z" })),
}));
vi.mock("./preview-share", () => ({ default: () => null }));
vi.mock("./embed-share", () => ({ default: () => null }));
import SlugEditor from "./slug-editor";
import { confirmPropertySlugAction } from "@/app/admin/_actions";

function findConfirm(node: ReactNode): ReactElement<{ onClick: () => void }> | undefined {
  if (!node || typeof node !== "object") return;
  if (Array.isArray(node)) return node.map(findConfirm).find(Boolean);
  const el = node as ReactElement<{ children?: ReactNode; onClick: () => void }>;
  if (el.type === "button" && el.props.children === "このURLでよい") return el;
  return findConfirm(el.props?.children);
}

it("routes embedded URL confirmation through the parent autosave, without an independent version-changing write", async () => {
  vi.clearAllMocks();
  const onConfirmed = vi.fn();
  const element = SlugEditor({ id: "example", status: "draft", embedded: true, onConfirmed });
  findConfirm(element)!.props.onClick();
  await Promise.all(state.pending.splice(0));
  expect(onConfirmed).toHaveBeenCalledWith(expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/));
  expect(confirmPropertySlugAction).not.toHaveBeenCalled();
});

it("still persists URL confirmation when no parent form owns saving", async () => {
  vi.clearAllMocks();
  findConfirm(SlugEditor({ id: "example", status: "draft" }))!.props.onClick();
  await Promise.all(state.pending.splice(0));
  expect(confirmPropertySlugAction).toHaveBeenCalledWith("example");
});
