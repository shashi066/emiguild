import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { getAdminOccupancy } from "@/lib/admin-occupancy";
import { shiftDate } from "@/lib/occupancy";
import { getTodayString } from "@/lib/utils";
import { OccupancyReport } from "@/components/admin/OccupancyReport";

export const dynamic = "force-dynamic";
export default async function OccupancyPage() {
  const session = await auth();
  if (!session || session.user.role !== "ADMIN") redirect("/");
  const today = getTodayString();
  const report = await getAdminOccupancy(shiftDate(today, -29), today);
  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Occupancy</h1>
          <p className="page-subtitle">Checked-in screen-hours</p>
        </div>
      </div>
      <OccupancyReport initialReport={report} today={today} />
    </div>
  );
}
