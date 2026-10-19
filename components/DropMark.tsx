// しずくのマーク(ハブの TamariBiyoriIcon と同じ形)。線は小豆色、右上の点は金色。
export default function DropMark({ size = 26 }: { size?: number }) {
  return (
    <svg
      width={(size * 22) / 27}
      height={size}
      viewBox="4 -5 22 27"
      aria-hidden="true"
      fill="none"
      stroke="var(--brand)"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M12 3c-3.5 5-6 8.7-6 12a6 6 0 0 0 12 0c0-3.3-2.5-7-6-12z" />
      <circle cx="21.1" cy="-0.15" r="4.35" fill="var(--gold)" stroke="none" />
    </svg>
  );
}
