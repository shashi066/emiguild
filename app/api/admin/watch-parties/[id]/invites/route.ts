import { after, NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { notifyUserWatchPartyInvite } from '@/lib/notify';
import {
  cancelWatchPartyInvite,
  friendlyWatchPartyError,
  inviteWatchPartyUsers,
} from '@/lib/watch-party';

export const dynamic = 'force-dynamic';

type InviteEmailRecipient = {
  userId: string;
  userName: string;
  userEmail: string;
};

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id || session.user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  const { id } = await params;

  try {
    const body = await req.json();
    const party = await inviteWatchPartyUsers(session.user.id, id, body.userIds);
    const requestedUserIds = new Set(
      Array.isArray(body.userIds)
        ? body.userIds.filter((userId: unknown): userId is string => typeof userId === 'string')
        : [],
    );
    const partyInvites = party.invites as InviteEmailRecipient[];
    const recipients = partyInvites.filter((invite) => (
      requestedUserIds.has(invite.userId) && Boolean(invite.userEmail)
    ));

    if (recipients.length > 0) {
      after(async () => {
        await Promise.all(recipients.map((invite) => notifyUserWatchPartyInvite({
          customerName: invite.userName,
          customerEmail: invite.userEmail,
          partyId: party.id,
          title: party.title,
          homeTeam: party.homeTeam,
          awayTeam: party.awayTeam,
          kickoffAt: party.kickoffAt,
          venue: party.venue,
        })));
      });
    }
    return NextResponse.json({ party }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    const friendly = friendlyWatchPartyError(error);
    return NextResponse.json(
      { error: friendly.error, code: friendly.code },
      { status: friendly.status },
    );
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id || session.user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  const { id } = await params;

  try {
    const body = await req.json();
    const party = await cancelWatchPartyInvite(session.user.id, id, body.userId);
    return NextResponse.json({ party }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    const friendly = friendlyWatchPartyError(error);
    return NextResponse.json(
      { error: friendly.error, code: friendly.code },
      { status: friendly.status },
    );
  }
}
