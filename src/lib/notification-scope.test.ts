import { expect, it } from "vitest";
import { notificationScope } from "./notification-scope";
it.each(["inquiry_new", "publish_request", "scan_submission", "contact_request", "production_request"])("classifies historical %s as admin without requiring new columns", type => {
  expect(notificationScope({ type, link: "" })).toBe("admin");
});
it.each(["inquiry_reply", "scan_status", "production_status", "policy_update"])("keeps %s personal", type => {
  expect(notificationScope({ type, link: "/account" })).toBe("user");
});
it("keeps unknown admin-linked rows out of personal feeds without treating admin-like paths as admin", () => {
  expect(notificationScope({ type: "legacy", link: "/en/admin/inquiries#1" })).toBe("admin");
  expect(notificationScope({ type: "legacy", link: "/administrator" })).toBe("user");
});
