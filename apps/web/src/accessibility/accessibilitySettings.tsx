import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

export const accessibilitySettingsStorageKey =
  "over-nerv-block:accessibility:v1";

export const hitKeyOptions = [
  "Space",
  "Enter",
  "KeyA",
  "KeyF",
  "KeyJ",
  "KeyK",
] as const;
export type HitKeyCode = (typeof hitKeyOptions)[number];
export type MotionPreference = "system" | "reduce" | "full";

export interface AccessibilitySettings {
  readonly version: 1;
  readonly motion: MotionPreference;
  readonly hitKey: HitKeyCode;
}

const defaultSettings: AccessibilitySettings = {
  version: 1,
  motion: "system",
  hitKey: "Space",
};

export const hitKeyLabels: Readonly<Record<HitKeyCode, string>> = {
  Space: "Space",
  Enter: "Enter",
  KeyA: "A",
  KeyF: "F",
  KeyJ: "J",
  KeyK: "K",
};

function isMotionPreference(value: unknown): value is MotionPreference {
  return value === "system" || value === "reduce" || value === "full";
}

function isHitKey(value: unknown): value is HitKeyCode {
  return hitKeyOptions.some((key) => key === value);
}

export function parseAccessibilitySettings(
  value: string | null,
): AccessibilitySettings {
  if (!value) return defaultSettings;
  try {
    const parsed: unknown = JSON.parse(value);
    if (
      typeof parsed === "object" &&
      parsed !== null &&
      Object.keys(parsed).length === 3 &&
      (parsed as Record<string, unknown>).version === 1 &&
      isMotionPreference((parsed as Record<string, unknown>).motion) &&
      isHitKey((parsed as Record<string, unknown>).hitKey)
    ) {
      return parsed as AccessibilitySettings;
    }
  } catch {
    // Invalid local preference is replaced by the privacy-safe default.
  }
  return defaultSettings;
}

interface AccessibilityContextValue {
  readonly settings: AccessibilitySettings;
  readonly setMotion: (motion: MotionPreference) => void;
  readonly setHitKey: (hitKey: HitKeyCode) => void;
}

const AccessibilityContext = createContext<AccessibilityContextValue>({
  settings: defaultSettings,
  setMotion: () => undefined,
  setHitKey: () => undefined,
});

function initialSettings(): AccessibilitySettings {
  try {
    return parseAccessibilitySettings(
      localStorage.getItem(accessibilitySettingsStorageKey),
    );
  } catch {
    return defaultSettings;
  }
}

export function AccessibilityProvider({
  children,
}: {
  readonly children: ReactNode;
}) {
  const [settings, setSettings] = useState(initialSettings);

  useEffect(() => {
    document.documentElement.dataset.motion = settings.motion;
    try {
      localStorage.setItem(
        accessibilitySettingsStorageKey,
        JSON.stringify(settings),
      );
    } catch {
      // Settings still apply for this tab when storage is unavailable.
    }
  }, [settings]);

  const value = useMemo<AccessibilityContextValue>(
    () => ({
      settings,
      setMotion: (motion) => setSettings((current) => ({ ...current, motion })),
      setHitKey: (hitKey) => setSettings((current) => ({ ...current, hitKey })),
    }),
    [settings],
  );
  return (
    <AccessibilityContext.Provider value={value}>
      {children}
    </AccessibilityContext.Provider>
  );
}

export function useAccessibilitySettings(): AccessibilityContextValue {
  return useContext(AccessibilityContext);
}

export function isEditableKeyboardTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return Boolean(
    target.closest(
      'input, select, textarea, [contenteditable=""], [contenteditable="true"]',
    ),
  );
}
