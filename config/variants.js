// SKU matrix. Edit freely: the scraper, matcher and dashboard all read from here.
// `hex` is only used for the colour swatch dot in the dashboard.
// Dates are calendar dates in Asia/Kuwait. `preorderOpens` gates the "Coming soon"
// state in the UI; the scraper always attempts every model regardless.

export const CAPACITIES = ['256GB', '512GB', '1TB', '2TB'];

export const MODELS = [
  {
    id: 'iphone-18-pro',
    name: 'iPhone 18 Pro',
    shortName: '18 Pro',
    colors: [
      { name: 'Black', hex: '#1d1d1f' },
      { name: 'Silver', hex: '#d9d9de' },
      { name: 'Glacier', hex: '#cfe3ef' },
      { name: 'Burgundy', hex: '#6e1f2e' },
    ],
    capacities: CAPACITIES,
    preorderOpens: '2026-09-12',
    releaseDate: '2026-09-18',
  },
  {
    id: 'iphone-18-pro-max',
    name: 'iPhone 18 Pro Max',
    shortName: '18 Pro Max',
    colors: [
      { name: 'Black', hex: '#1d1d1f' },
      { name: 'Silver', hex: '#d9d9de' },
      { name: 'Glacier', hex: '#cfe3ef' },
      { name: 'Burgundy', hex: '#6e1f2e' },
    ],
    capacities: CAPACITIES,
    preorderOpens: '2026-09-12',
    releaseDate: '2026-09-18',
  },
  {
    id: 'iphone-duo',
    name: 'iPhone Duo',
    shortName: 'Duo',
    colors: [
      { name: 'Star White', hex: '#f2f0ea' },
      { name: 'Night Sky', hex: '#1c2233' },
    ],
    capacities: CAPACITIES,
    preorderOpens: '2026-10-16',
    releaseDate: '2026-10-23',
  },
];

export const STATUS = Object.freeze({
  IN_STOCK: 'IN_STOCK',
  OUT_OF_STOCK: 'OUT_OF_STOCK',
  NOT_LISTED: 'NOT_LISTED',
  ERROR: 'ERROR',
});

export function variantKey(modelId, color, capacity) {
  return `${modelId}|${color}|${capacity}`;
}

export function allVariants() {
  const out = [];
  for (const m of MODELS) {
    for (const c of m.colors) {
      for (const cap of m.capacities) {
        out.push({ modelId: m.id, color: c.name, capacity: cap, key: variantKey(m.id, c.name, cap) });
      }
    }
  }
  return out;
}
