import {
  systemHealthSchema,
  systemVersionSchema,
  type SystemHealth,
  type SystemVersion,
} from "@rhythm-game/chart-schema";

export interface SystemSnapshot {
  health: SystemHealth;
  version: SystemVersion;
}

const apiBaseUrl = (import.meta.env.VITE_API_BASE_URL ?? "/api").replace(
  /\/$/,
  "",
);

async function readJson(response: Response): Promise<unknown> {
  if (!response.ok) {
    throw new Error(`System check failed with status ${response.status}`);
  }

  return response.json();
}

export async function getSystemSnapshot(
  signal?: AbortSignal,
): Promise<SystemSnapshot> {
  const [healthResponse, versionResponse] = await Promise.all([
    fetch(`${apiBaseUrl}/health`, { signal }),
    fetch(`${apiBaseUrl}/version`, { signal }),
  ]);

  const [health, version] = await Promise.all([
    readJson(healthResponse),
    readJson(versionResponse),
  ]);

  return {
    health: systemHealthSchema.parse(health),
    version: systemVersionSchema.parse(version),
  };
}
