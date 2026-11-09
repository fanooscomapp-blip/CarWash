// Simple side-profile silhouettes for body types (original line drawings, 64×28 viewBox). currentColor so they inherit text colour.
const P = {
  sedan: 'M6 20h3l3-7 8-3h12l9 3 6 2h10a3 3 0 0 1 3 3v2h-5a4 4 0 0 0-8 0H22a4 4 0 0 0-8 0H6z M21 12l-2 5h8v-5z M30 12v5h9l-2-5z',
  suv: 'M5 21h3l2-10 6-4h22l8 4 8 2a4 4 0 0 1 4 4v4h-5a4 4 0 0 0-8 0H21a4 4 0 0 0-8 0H5z M17 9l-4 7h10V9z M26 9v7h11l-4-7z',
  hatchback: 'M6 21h3l3-8 7-5h14l9 5 5 3h8a3 3 0 0 1 3 3v2h-5a4 4 0 0 0-8 0H22a4 4 0 0 0-8 0H6z M19 10l-3 6h9v-6z M28 10v6h10l-4-6z',
  crossover: 'M5 21h3l3-9 6-4h20l9 4 6 2h6a3 3 0 0 1 3 3v4h-5a4 4 0 0 0-8 0H21a4 4 0 0 0-8 0H5z M18 10l-3 6h9v-6z M27 10v6h11l-5-6z',
  pickup: 'M4 21h3l3-10 5-4h16l5 4v3h21a3 3 0 0 1 3 3v4h-5a4 4 0 0 0-8 0H21a4 4 0 0 0-8 0H4z M16 9l-3 6h8V9z M24 9v6h7l-2-6z',
  van: 'M5 21h3l2-12 5-3h32a4 4 0 0 1 4 4l6 5v6h-5a4 4 0 0 0-8 0H21a4 4 0 0 0-8 0H5z M16 8l-3 7h10V8z M26 8v7h18l-3-7z',
  coupe: 'M6 21h3l4-6 10-6h12l9 6 8 3h5a3 3 0 0 1 3 3v2h-5a4 4 0 0 0-8 0H22a4 4 0 0 0-8 0H6z M22 11l-6 5h11v-5z M30 11v5h10l-5-5z',
  minivan: 'M5 21h3l3-10 6-5h28a4 4 0 0 1 4 4l5 5v6h-5a4 4 0 0 0-8 0H21a4 4 0 0 0-8 0H5z M17 8l-4 7h10V8z M26 8v7h17l-4-7z',
  motorcycle: 'M8 22a6 6 0 1 1 12 0 6 6 0 0 1-12 0z M44 22a6 6 0 1 1 12 0 6 6 0 0 1-12 0z M14 22l10-10h10l8 10 M30 12l6-6h6 M20 12l-6-4',
  other: 'M8 20h48 M16 20a4 4 0 1 0 8 0 M40 20a4 4 0 1 0 8 0 M12 20l6-9h26l8 9',
};
export default function BodyIcon({ type, className = 'h-7 w-14' }) {
  const d = P[type] || P.other;
  const outline = type === 'motorcycle' || type === 'other';
  return <svg viewBox="0 0 64 28" className={className} fill={outline ? 'none' : 'currentColor'} stroke="currentColor" strokeWidth={outline ? 2.2 : 0} strokeLinecap="round" strokeLinejoin="round" fillRule="evenodd" aria-hidden="true"><path d={d} /></svg>;
}
