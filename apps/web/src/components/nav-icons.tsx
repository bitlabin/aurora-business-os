import type { NavIcon } from '@aurora/types';

/**
 * Original 20px line icons for the sidebar, drawn on a 24-unit grid with a 1.75 stroke. Kept in
 * one file so the set stays visually consistent; nothing here is taken from any other product.
 */
const PATHS: Record<NavIcon, string> = {
  home: 'M4 11.5 12 5l8 6.5V19a1 1 0 0 1-1 1h-4.5v-5h-5v5H5a1 1 0 0 1-1-1z',
  products: 'M4 8.5 12 4l8 4.5v7L12 20l-8-4.5zM4 8.5l8 4.5m0 0 8-4.5M12 13v7',
  customers:
    'M9 12a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zm-6 8c0-3 2.7-5 6-5s6 2 6 5M16 5.3a3.5 3.5 0 0 1 0 6.4M17.5 15.2c2 .6 3.5 2.2 3.5 4.8',
  suppliers:
    'M3 7h11v9H3zM14 10h4l3 3v3h-7zM6.5 19a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3zm11 0a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3z',
  invoices: 'M6 3h9l4 4v14H6zM15 3v4h4M9 12h6M9 16h6M9 8h2',
  orders:
    'M4 6h2l2.2 9.5h9.3L20 8H7M10 20a1 1 0 1 0 0-2 1 1 0 0 0 0 2zm7 0a1 1 0 1 0 0-2 1 1 0 0 0 0 2z',
  payments: 'M3 7h18v10H3zM3 11h18M7 15h3M12 11a2.5 2.5 0 1 0 0-.01',
  expenses: 'M12 3v18M8 7.5h5.5a2.5 2.5 0 0 1 0 5h-3a2.5 2.5 0 0 0 0 5H16',
  accounting: 'M5 3h14v18H5zM8 7h8M8 11h2m3 0h3M8 14.5h2m3 0h3M8 18h2m3 0h3',
  settings:
    'M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zM19.4 13.5l1.6-1.5-1.6-1.5.3-2.2-2.2-.5-.9-2-2.1.7L12 4.7l-2.5 1.8-2.1-.7-.9 2-2.2.5.3 2.2L3 12l1.6 1.5-.3 2.2 2.2.5.9 2 2.1-.7L12 19.3l2.5-1.8 2.1.7.9-2 2.2-.5z',
};

export function NavIconGlyph({ name }: { name: NavIcon }) {
  return (
    <svg
      className="au-nav-icon"
      viewBox="0 0 24 24"
      width="20"
      height="20"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d={PATHS[name]} />
    </svg>
  );
}
