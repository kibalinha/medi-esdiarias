import { CampoWorkspace } from "@/components/campo/CampoWorkspace";

export default async function CampoSetorPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  return <CampoWorkspace sectorSlug={slug} />;
}
