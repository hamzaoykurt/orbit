import { useId } from 'react';

type OrbitMarkProps = {
  className?: string;
};

export function OrbitMark({ className }: OrbitMarkProps) {
  const id = useId().replace(/:/g, '');

  return (
    <svg className={className} viewBox="0 0 64 64" fill="none" aria-hidden="true">
      <defs>
        <radialGradient id={`${id}-glass`} cx="0" cy="0" r="1" gradientTransform="translate(26 23) rotate(47) scale(25)">
          <stop stopColor="#FFF8F0" stopOpacity="0.42" />
          <stop offset="0.48" stopColor="#F6AD78" stopOpacity="0.18" />
          <stop offset="1" stopColor="#B84E3B" stopOpacity="0.05" />
        </radialGradient>
        <linearGradient id={`${id}-edge`} x1="18" y1="18" x2="46" y2="47" gradientUnits="userSpaceOnUse">
          <stop stopColor="#FFFDF8" stopOpacity="0.9" />
          <stop offset="0.42" stopColor="#FFD5B4" stopOpacity="0.5" />
          <stop offset="1" stopColor="#E78668" stopOpacity="0.2" />
        </linearGradient>
        <linearGradient id={`${id}-orbit`} x1="12" y1="43" x2="53" y2="20" gradientUnits="userSpaceOnUse">
          <stop stopColor="#D66E56" stopOpacity="0.12" />
          <stop offset="0.5" stopColor="#FFC69A" stopOpacity="0.62" />
          <stop offset="1" stopColor="#FFFDF8" stopOpacity="0.94" />
        </linearGradient>
      </defs>
      <circle cx="32" cy="32" r="12.5" fill={`url(#${id}-glass)`} stroke={`url(#${id}-edge)`} strokeWidth="1.8" />
      <ellipse cx="27.7" cy="26.2" rx="6.1" ry="3" transform="rotate(-24 27.7 26.2)" fill="#FFFDF8" fillOpacity="0.15" />
      <path d="M24.5 23.7C27.5 21.2 32 20.4 35.6 21.8" stroke="#FFFDF8" strokeOpacity="0.42" strokeWidth="0.9" strokeLinecap="round" />
      <ellipse cx="32" cy="32" rx="23" ry="8" transform="rotate(-28 32 32)" stroke={`url(#${id}-orbit)`} strokeWidth="2.6" />
      <circle cx="50.7" cy="21.9" r="2.25" fill="#FFF8ED" />
    </svg>
  );
}
