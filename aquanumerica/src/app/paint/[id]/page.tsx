import type { Metadata } from "next";
import { Suspense } from "react";
import { notFound } from "next/navigation";
import { Studio } from "@/components/studio/studio";
import { StudioSkeleton } from "@/components/studio/studio-skeleton";
import { CANVASES, getCanvasMeta } from "@/lib/canvases";

export function generateStaticParams() {
  return CANVASES.map((c) => ({ id: c.id }));
}

export async function generateMetadata({ params }: PageProps<"/paint/[id]">): Promise<Metadata> {
  const { id } = await params;
  const meta = getCanvasMeta(id);
  return meta ? { title: meta.title, description: meta.description } : { title: "Canvas not found" };
}

export default function PaintPage({ params }: PageProps<"/paint/[id]">) {
  // The skeleton is the instant shell for client navigations; params resolve inside the boundary.
  return (
    <Suspense fallback={<StudioSkeleton />}>
      <StudioRoute params={params} />
    </Suspense>
  );
}

async function StudioRoute({ params }: { params: PageProps<"/paint/[id]">["params"] }) {
  const { id } = await params;
  if (!getCanvasMeta(id)) notFound();
  return <Studio key={id} id={id} />;
}
