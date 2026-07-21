import {
  hitKeyLabels,
  hitKeyOptions,
  useAccessibilitySettings,
  type HitKeyCode,
  type MotionPreference,
} from "./accessibilitySettings";

export function AccessibilityPanel() {
  const { settings, setHitKey, setMotion } = useAccessibilitySettings();
  return (
    <section
      className="accessibility-card"
      aria-labelledby="accessibility-title"
    >
      <div>
        <p className="section-label">Access settings</p>
        <h2 id="accessibility-title">Make the game comfortable</h2>
        <p>
          These two preferences stay on this device. They contain no music or
          personal identity.
        </p>
      </div>
      <div className="accessibility-controls">
        <label htmlFor="motion-preference">Motion</label>
        <select
          id="motion-preference"
          value={settings.motion}
          onChange={(event) =>
            setMotion(event.target.value as MotionPreference)
          }
        >
          <option value="system">Follow device</option>
          <option value="reduce">Reduce motion</option>
          <option value="full">Full motion</option>
        </select>
        <label htmlFor="primary-hit-key">Primary hit key</label>
        <select
          id="primary-hit-key"
          value={settings.hitKey}
          onChange={(event) => setHitKey(event.target.value as HitKeyCode)}
        >
          {hitKeyOptions.map((key) => (
            <option key={key} value={key}>
              {hitKeyLabels[key]}
            </option>
          ))}
        </select>
      </div>
      <p className="accessibility-summary" role="status" aria-live="polite">
        Hit with {hitKeyLabels[settings.hitKey]}; motion is{" "}
        {settings.motion === "system"
          ? "following this device"
          : settings.motion === "reduce"
            ? "reduced"
            : "fully enabled"}
        .
      </p>
    </section>
  );
}
