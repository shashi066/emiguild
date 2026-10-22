import Link from "next/link";
import { occupancyHours, type OccupancyMetric } from "@/lib/occupancy";
import styles from "./occupancy.module.css";

export function OccupancyCards({
  items,
}: {
  items: (OccupancyMetric & { label: string })[];
}) {
  return (
    <div className={styles.cards}>
      {items.map((item) => (
        <div className={styles.metric} key={item.label}>
          <span>{item.label}</span>
          <strong
            style={{
              color: "#00d4ff",
            }}
          >
            {item.availableMinutes ? `${item.percentage}%` : "-"}
          </strong>
          <small>
            {occupancyHours(item.occupiedMinutes)} /{" "}
            {occupancyHours(item.availableMinutes)} screen-hours
          </small>
        </div>
      ))}
    </div>
  );
}
export function OccupancySummary({
  items,
}: {
  items: (OccupancyMetric & { label: string })[];
}) {
  return (
    <section className={styles.panel} aria-label="Occupancy">
      <div className={styles.heading}>
        <h2>Occupancy</h2>
        <Link href="/admin/occupancy">View details</Link>
      </div>
      <OccupancyCards items={items} />
    </section>
  );
}
