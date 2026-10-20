// カードと小さなしずくのマーク(ハブのカードと同じ形)。線は小豆色、右上の点は金色。
export default function CardMark({ size = 26 }: { size?: number }) {
  return (
    <svg
      width={(size * 25) / 26}
      height={size}
      viewBox="2 -6 25 26"
      aria-hidden="true"
      fill="none"
      stroke="var(--brand)"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect x="3" y="6" width="18" height="13" rx="2.5" />
      <path d="M3 10h18" />
      <path d="M8.6 12.2c-0.9 1.2-1.5 2.1-1.5 2.9a1.5 1.5 0 0 0 3 0c0-0.8-0.6-1.7-1.5-2.9z" />
      <circle cx="22" cy="-1" r="4.35" fill="var(--gold)" stroke="none" />
    </svg>
  );
}
