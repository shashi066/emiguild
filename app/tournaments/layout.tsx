import { TournamentLoadingBoundary } from '@/components/TournamentLoadingBoundary';

export default function TournamentsLayout({ children }: { children: React.ReactNode }) {
  return <TournamentLoadingBoundary>{children}</TournamentLoadingBoundary>;
}
