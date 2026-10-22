import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { getAdminOccupancy } from "@/lib/admin-occupancy";
import { validateOccupancyRange } from "@/lib/occupancy";
import { getTodayString } from "@/lib/utils";

export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session || session.user.role !== "ADMIN")
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const params = request.nextUrl.searchParams;
  const from = params.get("from") ?? "",
    to = params.get("to") ?? "";
  const error = validateOccupancyRange(from, to, getTodayString());
  if (error) return NextResponse.json({ error }, { status: 400 });
  try {
    return NextResponse.json(await getAdminOccupancy(from, to), {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch {
    return NextResponse.json(
      { error: "Could not load occupancy. Please try again." },
      { status: 500 },
    );
  }
}
