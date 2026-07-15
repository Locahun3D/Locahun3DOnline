/**
 * Unauthenticated-replay guard for the Stripe purchase return route.
 *
 * Reached via Stripe's success_url redirect (session_id in the URL, thus
 * replayable). Completing a purchase must require the caller to be
 * authenticated and scoped to their own purchases — previously an
 * unauthenticated caller listed (and could complete) purchases for whoever
 * the buyer actually was.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const mockGetCurrentUser = vi.fn();
vi.mock("@/lib/dal", () => ({
  getCurrentUser: (...args: unknown[]) => mockGetCurrentUser(...args),
}));

const mockList = vi.fn();
const mockUpsert = vi.fn();
const mockMarkCompletedIfPending = vi.fn();
vi.mock("@/lib/purchases", () => ({
  purchaseRepo: {
    list: (...args: unknown[]) => mockList(...args),
    upsert: (...args: unknown[]) => mockUpsert(...args),
    markCompletedIfPending: (...args: unknown[]) => mockMarkCompletedIfPending(...args),
  },
}));

const mockRetrieve = vi.fn();
vi.mock("@/lib/stripe", () => ({
  stripeEnabled: () => true,
  getStripe: () => ({
    checkout: { sessions: { retrieve: mockRetrieve } },
  }),
}));

const mockTrack = vi.fn();
vi.mock("@/lib/analytics", () => ({ track: (...args: unknown[]) => mockTrack(...args) }));

const mockNotifyPurchase = vi.fn();
vi.mock("@/lib/email", () => ({
  notifyPurchase: (...args: unknown[]) => mockNotifyPurchase(...args),
}));

const { GET } = await import("./route");

function makeSession(overrides: Record<string, unknown> = {}) {
  return {
    payment_status: "paid",
    metadata: { propertyId: "prop_1" },
    ...overrides,
  };
}

describe("GET /api/purchase/return — auth binding", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("redirects to sign-in and does NOT list/complete purchases when caller is unauthenticated", async () => {
    mockRetrieve.mockResolvedValue(makeSession());
    mockGetCurrentUser.mockResolvedValue(null);

    const req = new Request(
      "https://locahun3d.com/api/purchase/return?session_id=sess_replayed",
    );
    const res = await GET(req);

    expect(mockList).not.toHaveBeenCalled();
    expect(mockMarkCompletedIfPending).not.toHaveBeenCalled();
    expect(res.status).toBe(307);
    const location = res.headers.get("location") ?? "";
    expect(location).toContain("/sign-in");
    expect(location).toContain("redirect_url");
  });

  it("scopes the purchase lookup to the authenticated user (never lists all purchases)", async () => {
    mockRetrieve.mockResolvedValue(makeSession());
    mockGetCurrentUser.mockResolvedValue({ id: "user_owner", email: "owner@b.com" });
    mockList.mockResolvedValue([
      {
        id: "p1",
        userId: "user_owner",
        propertyId: "prop_1",
        stripeSessionId: "sess_real",
        status: "pending",
        priceYen: 500,
      },
    ]);
    mockMarkCompletedIfPending.mockImplementation(async (id, completedAt) => ({
      id,
      userId: "user_owner",
      propertyId: "prop_1",
      stripeSessionId: "sess_real",
      status: "completed",
      priceYen: 500,
      completedAt,
    }));

    const req = new Request(
      "https://locahun3d.com/api/purchase/return?session_id=sess_real",
    );
    const res = await GET(req);

    expect(mockList).toHaveBeenCalledWith({ userId: "user_owner" });
    expect(mockMarkCompletedIfPending).toHaveBeenCalledWith(
      "p1",
      expect.any(String),
    );
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toContain("purchase=success");
  });
});
