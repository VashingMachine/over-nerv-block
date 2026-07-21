import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";

import { AccessibilityPanel } from "./AccessibilityPanel";
import {
  AccessibilityProvider,
  accessibilitySettingsStorageKey,
  isEditableKeyboardTarget,
  parseAccessibilitySettings,
} from "./accessibilitySettings";

describe("accessibility settings", () => {
  beforeEach(() => localStorage.clear());

  it("accepts only the exact version-one preference shape", () => {
    expect(
      parseAccessibilitySettings(
        JSON.stringify({ version: 1, motion: "reduce", hitKey: "KeyF" }),
      ),
    ).toEqual({ version: 1, motion: "reduce", hitKey: "KeyF" });
    expect(
      parseAccessibilitySettings(
        JSON.stringify({
          version: 1,
          motion: "reduce",
          hitKey: "KeyF",
          filename: "private.mp3",
        }),
      ),
    ).toEqual({ version: 1, motion: "system", hitKey: "Space" });
    expect(parseAccessibilitySettings("not json")).toEqual({
      version: 1,
      motion: "system",
      hitKey: "Space",
    });
  });

  it("applies and persists reduced motion plus a remapped key", () => {
    render(
      <AccessibilityProvider>
        <AccessibilityPanel />
      </AccessibilityProvider>,
    );

    fireEvent.change(screen.getByLabelText("Motion"), {
      target: { value: "reduce" },
    });
    fireEvent.change(screen.getByLabelText("Primary hit key"), {
      target: { value: "KeyJ" },
    });

    expect(document.documentElement.dataset.motion).toBe("reduce");
    expect(screen.getByText(/Hit with J; motion is reduced/)).toBeVisible();
    expect(
      JSON.parse(localStorage.getItem(accessibilitySettingsStorageKey)!),
    ).toEqual({
      version: 1,
      motion: "reduce",
      hitKey: "KeyJ",
    });
  });

  it("recognizes form and editable targets that gameplay must not intercept", () => {
    const input = document.createElement("input");
    const select = document.createElement("select");
    const div = document.createElement("div");
    div.setAttribute("contenteditable", "true");
    document.body.append(input, select, div);
    expect(isEditableKeyboardTarget(input)).toBe(true);
    expect(isEditableKeyboardTarget(select)).toBe(true);
    expect(isEditableKeyboardTarget(div)).toBe(true);
    expect(isEditableKeyboardTarget(document.body)).toBe(false);
  });
});
