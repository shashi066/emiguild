import { DailySpinWidget } from '@/components/DailySpinWidget';

export const metadata = {
  title: 'Daily Loot Spin',
  description: 'Spin for your daily rewards at GameZone Cafe!',
};

export default function DailySpinPage() {
  return (
    <div className="container" style={{ paddingTop: 'var(--space-2xl)', paddingBottom: 'var(--space-2xl)' }}>
      <DailySpinWidget />
    </div>
  );
}
