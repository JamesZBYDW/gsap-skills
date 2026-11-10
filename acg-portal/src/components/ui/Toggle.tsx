'use client';

export function Toggle({
  on,
  onToggle,
  disabled,
  label,
}: {
  on: boolean;
  onToggle: () => void;
  disabled?: boolean;
  label?: string;
}) {
  return (
    <span
      role="switch"
      aria-checked={on}
      aria-label={label}
      tabIndex={disabled ? -1 : 0}
      className={`toggle${on ? ' on' : ''}`}
      onClick={() => !disabled && onToggle()}
      onKeyDown={(e) => {
        if (disabled) return;
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onToggle();
        }
      }}
      style={disabled ? { opacity: 0.5, cursor: 'default' } : undefined}
    >
      <span className="toggleKnob" />
    </span>
  );
}
