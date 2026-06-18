import { notFound } from "next/navigation";
import {
  getPublishedProperty,
  getPublishedProperties,
  getPublishedPropertyIds,
} from "@/lib/properties";
import PropertyDetailView from "@/components/property-detail-view";
import TrackView from "@/components/track-view";

export async function generateStaticParams() {
  const ids = await getPublishedPropertyIds();
  return ids.map((id) => ({ id }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const p = await getPublishedProperty(id);
  if (!p) return { title: "Not found" };
  return {
    title: p.title,
    description: p.summary,
    openGraph: { images: [p.cover.src] },
  };
}

export default async function PropertyDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const property = await getPublishedProperty(id);
  if (!property) notFound();

  const others = (await getPublishedProperties())
    .filter((p) => p.id !== property.id)
    .slice(0, 3);

  return (
    <>
      <TrackView propertyId={property.id} />
      <PropertyDetailView property={property} others={others} />
    </>
  );
}
