import type { Tone } from '@/lib/tone';

export function Pill({ tone, children }: { tone: Tone; children: React.ReactNode }) {
  return <span className={`pill pill--${tone}`}>{children}</span>;
}
