export function propertyTitleSegments(title: string): string[] {
  return Array.from(new Intl.Segmenter("ja", { granularity: "word" }).segment(title), part => part.segment);
}

/** Hide this owner's personal address only in the public presentation. */
export function publicPropertyEmail(id: string, email: string): string {
  return id === "shibuyasq" ? "" : email;
}

export function googleMapsUrl(coords: { lat: number; lng: number } | null, address: string): string {
  const query = coords && Number.isFinite(coords.lat) && Number.isFinite(coords.lng)
    ? `${coords.lat},${coords.lng}` : address.trim();
  return query ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}` : "";
}
