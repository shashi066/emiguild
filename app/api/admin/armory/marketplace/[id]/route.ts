import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import {
  cancelArmoryTradeListingAsAdmin,
  friendlyMarketplaceError,
} from '@/lib/armory-marketplace';

export async function DELETE(
  _req: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session || session.user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  try {
    const { id } = await context.params;
    const listing = await cancelArmoryTradeListingAsAdmin(id);
    return NextResponse.json({
      success: true,
      listing: {
        id: listing.id,
        status: listing.status,
      },
    }, {
      headers: { 'Cache-Control': 'no-store' },
    });
  } catch (error) {
    const friendly = friendlyMarketplaceError(error);
    return NextResponse.json(
      { error: friendly.error, code: friendly.code },
      { status: friendly.status },
    );
  }
}
