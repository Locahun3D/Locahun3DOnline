/**
 * Unauthenticated-replay guard for the Stripe subscribe return route.
 *
 * This route is reached via Stripe's success_url redirect, which carries a
 * `session_id` in the URL. Because that URL can be replayed by anyone,
 * applying the plan must require the *caller* to be authenticated AND match
 * the userId embedded in the Stripe session — otherwise a signed-out caller
 * (or a caller signed in as someone else) could trigger a state change for
 * an account that isn't theirs.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const mockGetCurrentUser = vi.fn();
vi.mock("@/lib/dal", () => ({
  getCurrentUser: (...args: unknown[]) => mockGetCurrentUser(...args),
}));

const mockApplyPlan = vi.fn();
vi.mock("@/lib/subscription", () => ({
  applyPlan: (...args: unknown[]) => mockApplyPlan(...args),
}));

const mockNotifySubscription = vi.fn();
vi.mock("@/lib/email", () => ({
  notifySubscription: (...args: unknown[]) => mockNotifySubscription(...args),
}));

const mockRetrieve = vi.fn();
vi.mock("@/lib/stripe", () => ({
  stripeEnabled: () => true,
  getStripe: () => ({
    checkout: { sessions: { retrieve: mockRetrieve } },
  }),
  planForPriceId: () => null,
}));

const { GET } = await import("./route");

function makeSession(overrides: Record<string, unknown> = {}) {
  return {
    payment_status: "paid",
    status: "complete",
    client_reference_id: "user_owner",
    metadata: { userId: "user_owner", plan: "individual" },
    customer: "cus_123",
    subscription: null,
    amount_total: 1000,
    ...overrides,
  };
}

describe("GET /api/subscribe/return — auth binding", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("redirects to sign-in and does NOT applyPlan when caller is unauthenticated", async () => {
    mockRetrieve.mockResolvedValue(makeSession());
    mockGetCurrentUser.mockResolvedValue(null);

    const req = new Request(
      "https://locahun3d.com/api/subscribe/return?session_id=sess_replayed",
    );
    const res = await GET(req);

    expect(mockApplyPlan).not.toHaveBeenCalled();
    expect(res.status).toBe(307);
    const location = res.headers.get("location") ?? "";
    expect(location).toContain("/sign-in");
    expect(location).toContain("redirect_url");
  });

  it("does NOT applyPlan when the authenticated caller differs from the session owner", async () => {
    mockRetrieve.mockResolvedValue(makeSession());
    mockGetCurrentUser.mockResolvedValue({ id: "user_attacker", email: "a@b.com" });

    const req = new Request(
      "https://locahun3d.com/api/subscribe/return?session_id=sess_replayed",
    );
    const res = await GET(req);

    expect(mockApplyPlan).not.toHaveBeenCalled();
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toContain("/account");
  });

  it("applies the plan for the legitimate authenticated buyer (happy path unchanged)", async () => {
    mockRetrieve.mockResolvedValue(makeSession());
    mockGetCurrentUser.mockResolvedValue({ id: "user_owner", email: "owner@b.com" });
    mockApplyPlan.mockResolvedValue({ id: "user_owner", email: "owner@b.com" });

    const req = new Request(
      "https://locahun3d.com/api/subscribe/return?session_id=sess_real",
    );
    const res = await GET(req);

    expect(mockApplyPlan).toHaveBeenCalledWith("user_owner", "individual", "cus_123");
    expect(res.status).toBe(307);
    const location = res.headers.get("location") ?? "";
    expect(location).toContain("/account");
    expect(location).toContain("checkout=success");
  });
});
