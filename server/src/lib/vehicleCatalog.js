// Reference lists for the registration form. Brands are a suggestion list (free text is still accepted).
export const VEHICLE_BRANDS = [
  'Toyota', 'Hyundai', 'Kia', 'Nissan', 'Chevrolet', 'MG', 'BMW', 'Mercedes-Benz', 'Audi', 'Volkswagen', 'Skoda', 'Seat', 'Renault', 'Peugeot', 'Citroën', 'Opel', 'Fiat',
  'Honda', 'Mitsubishi', 'Suzuki', 'Mazda', 'Subaru', 'Lexus', 'Infiniti', 'Jeep', 'Ford', 'Dodge', 'Chrysler', 'GMC', 'Cadillac', 'Land Rover', 'Range Rover', 'Jaguar', 'Volvo', 'Porsche', 'Mini',
  'Geely', 'Chery', 'BYD', 'Jetour', 'Haval', 'Changan', 'MG', 'Baic', 'Dongfeng', 'JAC', 'Proton', 'Lada', 'Daewoo', 'SsangYong', 'Tesla', 'Cupra', 'Alfa Romeo', 'Maserati', 'Bentley', 'Other',
].filter((v, i, a) => a.indexOf(v) === i);

export const BODY_TYPES = ['sedan', 'suv', 'hatchback', 'crossover', 'pickup', 'van', 'coupe', 'minivan', 'motorcycle', 'other'];

export const VEHICLE_COLORS = [
  { key: 'white', hex: '#f8fafc' }, { key: 'black', hex: '#111827' }, { key: 'silver', hex: '#c0c7d1' }, { key: 'grey', hex: '#6b7280' },
  { key: 'blue', hex: '#2563eb' }, { key: 'navy', hex: '#1e3a8a' }, { key: 'red', hex: '#dc2626' }, { key: 'maroon', hex: '#7f1d1d' },
  { key: 'green', hex: '#16a34a' }, { key: 'beige', hex: '#d6c7a1' }, { key: 'brown', hex: '#78350f' }, { key: 'gold', hex: '#ca8a04' },
  { key: 'orange', hex: '#ea580c' }, { key: 'yellow', hex: '#facc15' }, { key: 'purple', hex: '#7e22ce' }, { key: 'other', hex: 'linear-gradient(135deg,#f87171,#60a5fa,#4ade80)' },
];
