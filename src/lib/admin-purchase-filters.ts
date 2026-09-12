interface PurchaseFilterRecord {
  status: string;
  propertyId: string;
  propertyTitle: string;
  userEmail: string;
  itemLabel: string;
}
export interface AdminPurchaseFilters {
  q?: string;
  property?: string;
  status?: string;
  showPending?: boolean;
}
export function filterAdminPurchases<T extends PurchaseFilterRecord>(purchases: T[], filters: AdminPurchaseFilters): T[] {
  const query = (filters.q ?? "").trim().toLowerCase();
  const status = filters.status ?? "completed";
  return purchases.filter(p =>
    (!query || `${p.propertyTitle} ${p.userEmail} ${p.itemLabel}`.toLowerCase().includes(query)) &&
    (!filters.property || p.propertyId === filters.property) &&
    (p.status === "pending" ? !!filters.showPending : !status || p.status === status),
  );
}
