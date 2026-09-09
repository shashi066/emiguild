export type F12026Race = {
  id: string;
  name: string;
  shortName: string;
  venue: string;
  kickoffAt: string;
};

export type F12026Driver = {
  key: string;
  name: string;
  team: string;
};

export const F1_2026_RACES: readonly F12026Race[] = [
  { id: 'spain', name: 'Spanish Grand Prix 2026', shortName: 'Spanish Grand Prix', venue: 'Madring, Madrid', kickoffAt: '2026-09-13T13:00:00.000Z' },
  { id: 'azerbaijan', name: 'Azerbaijan Grand Prix 2026', shortName: 'Azerbaijan Grand Prix', venue: 'Baku City Circuit', kickoffAt: '2026-09-26T11:00:00.000Z' },
  { id: 'bahrain-malaysia', name: 'Bahrain Grand Prix in Malaysia 2026', shortName: 'Bahrain GP in Malaysia', venue: 'Sepang International Circuit', kickoffAt: '2026-10-04T07:00:00.000Z' },
  { id: 'singapore', name: 'Singapore Grand Prix 2026', shortName: 'Singapore Grand Prix', venue: 'Marina Bay Street Circuit', kickoffAt: '2026-10-11T12:00:00.000Z' },
  { id: 'united-states', name: 'United States Grand Prix 2026', shortName: 'United States Grand Prix', venue: 'Circuit of the Americas, Austin', kickoffAt: '2026-10-25T20:00:00.000Z' },
  { id: 'mexico', name: 'Mexico City Grand Prix 2026', shortName: 'Mexico City Grand Prix', venue: 'Autodromo Hermanos Rodriguez', kickoffAt: '2026-11-01T20:00:00.000Z' },
  { id: 'brazil', name: 'Sao Paulo Grand Prix 2026', shortName: 'Sao Paulo Grand Prix', venue: 'Interlagos', kickoffAt: '2026-11-08T17:00:00.000Z' },
  { id: 'las-vegas', name: 'Las Vegas Grand Prix 2026', shortName: 'Las Vegas Grand Prix', venue: 'Las Vegas Strip Circuit', kickoffAt: '2026-11-22T04:00:00.000Z' },
  { id: 'qatar', name: 'Qatar Grand Prix 2026', shortName: 'Qatar Grand Prix', venue: 'Lusail International Circuit', kickoffAt: '2026-11-29T16:00:00.000Z' },
  { id: 'abu-dhabi', name: 'Abu Dhabi Grand Prix 2026', shortName: 'Abu Dhabi Grand Prix', venue: 'Yas Marina Circuit', kickoffAt: '2026-12-06T13:00:00.000Z' },
] as const;

export const F1_2026_DRIVERS: readonly F12026Driver[] = [
  { key: 'RUSSELL', name: 'George Russell', team: 'Mercedes' },
  { key: 'ANTONELLI', name: 'Kimi Antonelli', team: 'Mercedes' },
  { key: 'LECLERC', name: 'Charles Leclerc', team: 'Ferrari' },
  { key: 'HAMILTON', name: 'Lewis Hamilton', team: 'Ferrari' },
  { key: 'NORRIS', name: 'Lando Norris', team: 'McLaren' },
  { key: 'PIASTRI', name: 'Oscar Piastri', team: 'McLaren' },
  { key: 'VERSTAPPEN', name: 'Max Verstappen', team: 'Red Bull Racing' },
  { key: 'HADJAR', name: 'Isack Hadjar', team: 'Red Bull Racing' },
  { key: 'LAWSON', name: 'Liam Lawson', team: 'Racing Bulls' },
  { key: 'LINDBLAD', name: 'Arvid Lindblad', team: 'Racing Bulls' },
  { key: 'GASLY', name: 'Pierre Gasly', team: 'Alpine' },
  { key: 'COLAPINTO', name: 'Franco Colapinto', team: 'Alpine' },
  { key: 'OCON', name: 'Esteban Ocon', team: 'Haas' },
  { key: 'BEARMAN', name: 'Oliver Bearman', team: 'Haas' },
  { key: 'HULKENBERG', name: 'Nico Hulkenberg', team: 'Audi' },
  { key: 'BORTOLETO', name: 'Gabriel Bortoleto', team: 'Audi' },
  { key: 'SAINZ', name: 'Carlos Sainz', team: 'Williams' },
  { key: 'ALBON', name: 'Alexander Albon', team: 'Williams' },
  { key: 'ALONSO', name: 'Fernando Alonso', team: 'Aston Martin' },
  { key: 'STROLL', name: 'Lance Stroll', team: 'Aston Martin' },
  { key: 'PEREZ', name: 'Sergio Perez', team: 'Cadillac' },
  { key: 'BOTTAS', name: 'Valtteri Bottas', team: 'Cadillac' },
] as const;

export const F1_2026_SOURCE = 'F1_2026';
export const F1_2026_COMPETITION = 'F1';
