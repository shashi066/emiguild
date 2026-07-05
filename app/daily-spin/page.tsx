import { DailySpinWidget } from '@/components/DailySpinWidget';

export const metadata = {
  title: 'Daily Guild Spin',
  description: 'Open the vault for your daily rewards at GameZone Cafe!',
};

export default function DailySpinPage() {
  return (
    <div className="container" style={{ paddingTop: 'var(--space-2xl)', paddingBottom: 'var(--space-2xl)' }}>
      <DailySpinWidget />
    </div>
  );
}
