import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { fetchPremierLeagueFixtureMatches, friendlyWatchPartyError } from '@/lib/watch-party';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const session = await auth();
  if (session?.user?.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  try {
    const { searchParams } = new URL(req.url);
    const matches = await fetchPremierLeagueFixtureMatches({
      dateFrom: searchParams.get('dateFrom'),
      dateTo: searchParams.get('dateTo'),
      matchday: searchParams.get('matchday'),
      team: searchParams.get('team'),
      hasTime: searchParams.get('hasTime'),
      teamsOnly: searchParams.get('teamsOnly'),
    });
    return NextResponse.json(matches, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    const friendly = friendlyWatchPartyError(error);
    return NextResponse.json(
      { error: friendly.error, code: friendly.code },
      { status: friendly.status },
    );
  }
}
