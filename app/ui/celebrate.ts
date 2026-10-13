// Short, purposeful completion feedback: floating label, a few particles and an
// optional banner. Pure DOM + CSS (transform/opacity only); skipped when motion is off.
// Particles are the confetti-8 symbol set (currentColor) in the decor palette: at most 14, 900 ms.
const COLORS = ['var(--sun)', 'var(--pink)', 'var(--mint)', 'var(--sky)', 'var(--lav)', 'var(--tang)'];
const SVG_NS = 'http://www.w3.org/2000/svg';
const motionOff = (motion: boolean) => !motion || window.matchMedia('(prefers-reduced-motion: reduce)').matches;

export function celebrateAt(x: number, y: number, options: { label?: string; particles?: number; motion: boolean }) {
  if (typeof document === 'undefined' || motionOff(options.motion)) return;
  const layer = document.createElement('div');
  layer.className = 'celebrate-layer';
  layer.setAttribute('aria-hidden', 'true');
  const wave = document.createElement('em');
  wave.style.cssText = `left:${x}px;top:${y}px`;
  layer.appendChild(wave);
  const count = Math.min(14, options.particles ?? 12);
  for (let i = 0; i < count; i++) {
    const piece = document.createElementNS(SVG_NS, 'svg');
    const use = document.createElementNS(SVG_NS, 'use');
    use.setAttribute('href', `/illustrations/confetti-8.svg#c${(i % 8) + 1}`);
    piece.appendChild(use);
    const angle = (Math.PI * 2 * i) / count + Math.random() * 0.5;
    const distance = 34 + Math.random() * 30;
    piece.setAttribute('width', '16'); piece.setAttribute('height', '16');
    piece.style.cssText = `left:${x}px;top:${y}px;color:${COLORS[i % COLORS.length]};--dx:${Math.round(Math.cos(angle) * distance)}px;--dy:${Math.round(Math.sin(angle) * distance - 14)}px`;
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

export function celebrateBanner(title: string, detail: string, motion: boolean, badge = false) {
  if (typeof document === 'undefined') return;
  const banner = document.createElement('div');
  banner.className = `celebrate-banner${motion ? '' : ' still'}${badge ? ' level' : ''}`;
  banner.setAttribute('role', 'status');
  if (badge) {
    const img = document.createElement('img');
    img.src = '/illustrations/level-badge.svg'; img.alt = ''; img.width = 48; img.height = 48;
    banner.appendChild(img);
  }
  const strong = document.createElement('strong'); strong.textContent = title;
  const span = document.createElement('span'); span.textContent = detail;
  banner.appendChild(strong); banner.appendChild(span);
  document.body.appendChild(banner);
  window.setTimeout(() => banner.remove(), 2600);
}
