const STATUS_COLORS: Record<string, string> = {
  PENDING: '#ffaa00', CONFIRMED: '#60a5fa', DELIVERED: '#34d399', RETURNED: '#a78bfa', CANCELLED: '#f87171',
};

export function RentalStatus({ status }: { status: string }) {
  const color = STATUS_COLORS[status] ?? STATUS_COLORS.PENDING;
  return <span className="rental-status" style={{ color, borderColor: color + '55', background: color + '18' }}>{status.charAt(0) + status.slice(1).toLowerCase()}</span>;
}

export function RentalGames({ value }: { value: string }) {
  let games: string[] = [];
  try {
    const parsed: unknown = JSON.parse(value);
    if (Array.isArray(parsed)) games = parsed.filter((game): game is string => typeof game === 'string');
  } catch { /* Legacy malformed data must not break the order page. */ }
  return <div className="rental-games">{games.map((game, index) => <span key={index}>{game}</span>)}</div>;
}
