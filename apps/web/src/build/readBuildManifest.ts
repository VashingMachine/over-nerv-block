import {
  buildManifestSchema,
  type BuildManifest,
} from "@rhythm-game/chart-schema";

export function buildManifestUrl(baseUri = document.baseURI): URL {
  return new URL("build-info.json", baseUri);
}

export async function readBuildManifest(
  signal?: AbortSignal,
): Promise<BuildManifest> {
  const response = await fetch(buildManifestUrl(), { signal });

  if (!response.ok) {
    throw new Error(`Build check failed with status ${response.status}`);
  }

  const result = buildManifestSchema.safeParse(await response.json());
  if (!result.success) {
    throw new Error("Build manifest is invalid");
  }

  return result.data;
}
