// Short, purposeful completion feedback: floating label, a few particles and an
// optional banner. Pure DOM + CSS (transform/opacity only); skipped when motion is off.
const COLORS = ['var(--accent)', 'var(--page-accent)', '#f2b43b', '#34b27b', '#e5586f'];

export function celebrateAt(x: number, y: number, options: { label?: string; particles?: number; motion: boolean }) {
  if (typeof document === 'undefined' || !options.motion || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const layer = document.createElement('div');
  layer.className = 'celebrate-layer';
  layer.setAttribute('aria-hidden', 'true');
  const count = Math.min(10, options.particles ?? 8);
  for (let i = 0; i < count; i++) {
    const piece = document.createElement('i');
    const angle = (Math.PI * 2 * i) / count + Math.random() * 0.5;
    const distance = 34 + Math.random() * 30;
    piece.style.cssText = `left:${x}px;top:${y}px;background:${COLORS[i % COLORS.length]};--dx:${Math.round(Math.cos(angle) * distance)}px;--dy:${Math.round(Math.sin(angle) * distance - 14)}px`;
    layer.appendChild(piece);
  }
  if (options.label) {
    const label = document.createElement('b');
    label.textContent = options.label;
    label.style.cssText = `left:${x}px;top:${y}px`;
    layer.appendChild(label);
  }
  document.body.appendChild(layer);
  window.setTimeout(() => layer.remove(), 1100);
}

export function celebrateBanner(title: string, detail: string, motion: boolean) {
  if (typeof document === 'undefined') return;
  const banner = document.createElement('div');
  banner.className = `celebrate-banner${motion ? '' : ' still'}`;
  banner.setAttribute('role', 'status');
  const strong = document.createElement('strong'); strong.textContent = title;
  const span = document.createElement('span'); span.textContent = detail;
  banner.appendChild(strong); banner.appendChild(span);
  document.body.appendChild(banner);
  window.setTimeout(() => banner.remove(), 2600);
}
