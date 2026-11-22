import React from 'react';
import type { LanternColorDef } from '../game/types';

export const TitleEmblemSvg: React.FC = () => (
  <svg
    viewBox="0 0 420 118"
    className="w-[310px] sm:w-[400px] h-auto overflow-visible"
    role="img"
    aria-label="Lantern Lane"
  >
    <defs>
      <radialGradient id="crestGlow" cx="50%" cy="50%" r="50%">
        <stop offset="0%" stopColor="#fef08a" stopOpacity="0.95" />
        <stop offset="55%" stopColor="#f59e0b" stopOpacity="0.45" />
        <stop offset="100%" stopColor="#f59e0b" stopOpacity="0" />
      </radialGradient>
      <linearGradient id="crestBody" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor="#fffbeb" />
        <stop offset="55%" stopColor="#fbbf24" />
        <stop offset="100%" stopColor="#b45309" />
      </linearGradient>
    </defs>

    {/* Subtle celestial arch hairline */}
    <path
      d="M 48 44 Q 210 6 372 44"
      fill="none"
      stroke="#fbbf24"
      strokeOpacity="0.28"
      strokeWidth="1.2"
    />
    <circle cx="88" cy="34" r="1.8" fill="#fde68a" opacity="0.65" />
    <circle cx="332" cy="34" r="1.8" fill="#fde68a" opacity="0.65" />

    {/* Center miniature celestial lantern crest */}
    <g transform="translate(210, 26)">
      <circle cx="0" cy="0" r="24" fill="url(#crestGlow)" />
      <rect x="-7" y="-15" width="14" height="3.2" rx="1.4" fill="#451a03" stroke="#fbbf24" strokeWidth="0.9" />
      <ellipse cx="0" cy="0" rx="10.5" ry="13" fill="url(#crestBody)" stroke="#78350f" strokeWidth="1" />
      <ellipse cx="0" cy="0" rx="4.8" ry="12.6" fill="none" stroke="#92400e" strokeOpacity="0.45" strokeWidth="0.9" />
      <polygon points="0,-5 2.8,0 0,5 -2.8,0" fill="#ffffff" opacity="0.88" />
      <rect x="-6" y="11.5" width="12" height="3" rx="1.2" fill="#451a03" stroke="#fbbf24" strokeWidth="0.9" />
      <line x1="0" y1="14.5" x2="0" y2="21" stroke="#fbbf24" strokeWidth="1.5" strokeLinecap="round" />
    </g>

    {/* Bespoke title typography with dark outer stroke for crisp contrast over starfield */}
    <text
      x="210"
      y="90"
      textAnchor="middle"
      fill="#fef9eb"
      stroke="#060816"
      strokeWidth="6"
      paintOrder="stroke fill"
      style={{
        fontFamily: "'Fraunces', Georgia, serif",
        fontSize: '46px',
        fontWeight: 700,
        letterSpacing: '0.02em',
      }}
    >
      Lantern Lane
    </text>

    {/* Subtle flanking star ticks */}
    <line x1="78" y1="108" x2="176" y2="108" stroke="#fbbf24" strokeOpacity="0.32" strokeWidth="1" />
    <polygon points="210,103 214,108 210,113 206,108" fill="#fbbf24" opacity="0.85" />
    <line x1="244" y1="108" x2="342" y2="108" stroke="#fbbf24" strokeOpacity="0.32" strokeWidth="1" />
  </svg>
);

export const HeartSocketIcon: React.FC<{
  state: 'full' | 'cracked' | 'empty';
  size?: number;
}> = ({ state, size = 24 }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    aria-hidden="true"
  >
    <path
      d="M12 20.4C11.7 20.4 11.4 20.3 11.2 20.1C6.4 16.2 3.5 13.1 3.5 9.2C3.5 6.4 5.7 4.2 8.4 4.2C10 4.2 11.3 5 12 6.1C12.7 5 14 4.2 15.6 4.2C18.3 4.2 20.5 6.4 20.5 9.2C20.5 13.1 17.6 16.2 12.8 20.1C12.6 20.3 12.3 20.4 12 20.4Z"
      fill={
        state === 'full'
          ? '#fb7185'
          : state === 'cracked'
            ? '#fda4af'
            : 'rgba(15, 23, 42, 0.72)'
      }
      stroke={
        state === 'full'
          ? '#4c0519'
          : state === 'cracked'
            ? '#fff1f2'
            : 'rgba(251, 191, 36, 0.35)'
      }
      strokeWidth="1.8"
    />
    {state === 'full' && (
      <path
        d="M7.6 7.4C7.9 6.5 8.7 6.1 9.5 6.3"
        stroke="#ffe4e6"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
    )}
    {state === 'cracked' && (
      <path
        d="M12.3 6.2L10.7 10.6L13.4 12.1L11.2 17.2"
        stroke="#4c0519"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    )}
  </svg>
);

export const GoldLanternIcon: React.FC<{ size?: number }> = ({ size = 22 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <rect x="8.5" y="2.5" width="7" height="2.4" rx="1" fill="#451a03" stroke="#fbbf24" strokeWidth="1" />
    <ellipse cx="12" cy="11.5" rx="6.6" ry="7.6" fill="#fbbf24" stroke="#451a03" strokeWidth="1.5" />
    <ellipse cx="12" cy="11.5" rx="2.8" ry="7.2" stroke="#92400e" strokeOpacity="0.55" strokeWidth="1" />
    <polygon points="12,8.4 13.7,11.5 12,14.6 10.3,11.5" fill="#fffbeb" />
    <rect x="9" y="18.6" width="6" height="2.1" rx="0.9" fill="#451a03" stroke="#fbbf24" strokeWidth="1" />
    <line x1="12" y1="20.7" x2="12" y2="23" stroke="#fbbf24" strokeWidth="1.6" strokeLinecap="round" />
  </svg>
);

export const MiniLanternPreview: React.FC<{ color: LanternColorDef; size?: number }> = ({
  color,
  size = 42,
}) => (
  <svg width={size} height={size} viewBox="0 0 48 48" fill="none" aria-hidden="true">
    <circle cx="24" cy="24" r="21" fill={color.glowRgba} />
    {color.hasShield && (
      <circle
        cx="24"
        cy="24"
        r="19.5"
        stroke={color.accentHex}
        strokeWidth="1.5"
        strokeOpacity="0.85"
      />
    )}
    {color.hasMagnet && (
      <path
        d="M 8 18 A 18 18 0 0 1 40 18"
        stroke={color.accentHex}
        strokeWidth="1.5"
        strokeDasharray="3 3"
        strokeOpacity="0.9"
      />
    )}
    <rect
      x="16.5"
      y="7"
      width="15"
      height="4"
      rx="1.6"
      fill="#1e1b2e"
      stroke={color.trimColor}
      strokeWidth="1.2"
    />
    <ellipse
      cx="24"
      cy="23.5"
      rx="12"
      ry="14"
      fill={color.accentHex}
      stroke="#0f172a"
      strokeWidth="1.4"
      fillOpacity={color.hasGhost ? 0.82 : 1}
    />
    <ellipse cx="24" cy="23.5" rx="5.5" ry="13.5" stroke="#0f172a" strokeOpacity="0.3" strokeWidth="1.1" />
    <polygon points="24,17 27.5,23.5 24,30 20.5,23.5" fill={color.bodyCore} />
    <rect
      x="17.5"
      y="36.5"
      width="13"
      height="3.6"
      rx="1.4"
      fill="#1e1b2e"
      stroke={color.trimColor}
      strokeWidth="1.2"
    />
    <line x1="24" y1="40.1" x2="24" y2="45.5" stroke={color.accentHex} strokeWidth="2" strokeLinecap="round" />
  </svg>
);

export const PauseIcon: React.FC = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <rect x="6" y="4.5" width="4.5" height="15" rx="1.4" fill="currentColor" />
    <rect x="13.5" y="4.5" width="4.5" height="15" rx="1.4" fill="currentColor" />
  </svg>
);

export const SoundIcon: React.FC<{ muted: boolean }> = ({ muted }) => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <path
      d="M4.5 9.5H8.5L13.5 5.2V18.8L8.5 14.5H4.5V9.5Z"
      fill="currentColor"
    />
    {muted ? (
      <path
        d="M16.5 9.2L21 14.8M21 9.2L16.5 14.8"
        stroke="#fb7185"
        strokeWidth="2"
        strokeLinecap="round"
      />
    ) : (
      <>
        <path
          d="M16.8 8.8C18.1 10.1 18.1 13.9 16.8 15.2"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
        />
        <path
          d="M19.3 6.5C21.6 9.1 21.6 14.9 19.3 17.5"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
        />
      </>
    )}
  </svg>
);
