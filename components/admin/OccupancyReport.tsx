"use client";
import { useEffect, useRef, useState } from "react";
import {
  occupancyHours,
  shiftDate,
  weekStart,
  validateOccupancyRange,
  type OccupancyReport as Report,
} from "@/lib/occupancy";
import { OccupancyCards } from "./OccupancySummary";
import styles from "./occupancy.module.css";

export function OccupancyReport({
  initialReport,
  today,
}: {
  initialReport: Report;
  today: string;
}) {
  const [report, setReport] = useState(initialReport);
  const [from, setFrom] = useState(initialReport.from),
    [to, setTo] = useState(initialReport.to);
  const [group, setGroup] = useState<"daily" | "weekly" | "monthly">("daily");
  const [loading, setLoading] = useState(false),
    [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0),
    [selected, setSelected] = useState("");
  const requestId = useRef(0),
    initial = useRef(true);
  useEffect(() => {
    if (initial.current) {
      initial.current = false;
      return;
    }
    const id = ++requestId.current;
    const validation = validateOccupancyRange(from, to, today);
    if (validation) {
      setError(validation);
      setLoading(false);
      return;
    }
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setLoading(true);
      setError("");
      try {
        const response = await fetch(
          `/api/admin/occupancy?${new URLSearchParams({ from, to })}`,
          { signal: controller.signal },
        );
        const result = await response.json();
        if (!response.ok)
          throw new Error(result.error || "Could not load occupancy.");
        if (id === requestId.current && !controller.signal.aborted) {
          setReport(result);
          setSelected("");
        }
      } catch (err) {
        if (!controller.signal.aborted && id === requestId.current)
          setError(
            err instanceof Error ? err.message : "Could not load occupancy.",
          );
      } finally {
        if (!controller.signal.aborted && id === requestId.current)
          setLoading(false);
      }
    }, 250);
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [from, to, today, attempt]);
  function preset(start: string) {
    setFrom(start);
    setTo(today);
  }
  return (
    <>
      <div
        className={styles.tabs}
        style={{ marginBottom: 16 }}
        aria-label="Date presets"
      >
        {[
          ["This Week", weekStart(today)],
          ["This Month", today.slice(0, 7) + "-01"],
          ["Last 30 Days", shiftDate(today, -29)],
          ["Last 90 Days", shiftDate(today, -89)],
        ].map(([label, start]) => (
          <button
            key={label}
            type="button"
            aria-pressed={from === start && to === today}
            onClick={() => preset(start)}
          >
            {label}
          </button>
        ))}
      </div>
      <div className={styles.controls}>
        <label>
          From
          <input
            type="date"
            className="form-input"
            max={today}
            value={from}
            onChange={(e) => setFrom(e.target.value)}
          />
        </label>
        <label>
          To
          <input
            type="date"
            className="form-input"
            max={today}
            value={to}
            onChange={(e) => setTo(e.target.value)}
          />
        </label>
        <button
          className="btn btn-ghost"
          type="button"
          disabled={loading}
          onClick={() => setAttempt((n) => n + 1)}
        >
          Refresh
        </button>
      </div>
      <div className={styles.status} role="status">
        {loading ? "Updating occupancy..." : ""}
      </div>
      {error && (
        <div className={styles.error} role="alert">
          {error}{" "}
          <button
            className="btn btn-ghost btn-sm"
            type="button"
            onClick={() => setAttempt((n) => n + 1)}
          >
            Retry
          </button>
        </div>
      )}
      <div className={styles.heading}>
        <span>
          {report.from} to {report.to}
        </span>
        <span>{report.capacity} screens</span>
      </div>
      <section className={styles.panel} aria-label="Occupancy summary">
        <OccupancyCards
          items={[
            { label: "Overall", ...report.summary },
            { label: "Weekdays", ...report.weekdays },
            { label: "Weekends", ...report.weekends },
          ]}
        />
      </section>
      <section className={styles.panel} aria-label="Occupancy trend">
        <div className={styles.heading}>
          <h2>Occupancy trend</h2>
          <div className={styles.tabs} aria-label="Trend grouping">
            {(["daily", "weekly", "monthly"] as const).map((key, i) => (
              <button
                key={key}
                type="button"
                aria-pressed={group === key}
                onClick={() => setGroup(key)}
              >
                {["Day", "Week", "Month"][i]}
              </button>
            ))}
          </div>
        </div>
        <div className={styles.trends}>
          {report[group].map((row) => (
            <div className={styles.row} key={row.key}>
              <div>
                {group === "monthly" ? row.key : row.from}
                {group !== "daily" && (
                  <small>
                    {row.from} to {row.to}
                  </small>
                )}
                <small>
                  {occupancyHours(row.occupiedMinutes)} /{" "}
                  {occupancyHours(row.availableMinutes)} hours
                </small>
              </div>
              <div className={styles.track} aria-hidden="true">
                <div
                  className={styles.bar}
                  style={{ width: `${row.percentage}%` }}
                />
              </div>
              <strong>{row.percentage}%</strong>
            </div>
          ))}
        </div>
      </section>
      <section className={styles.panel} aria-label="Day of week comparison">
        <div className={styles.heading}>
          <h2>By day of week</h2>
        </div>
        <OccupancyCards items={report.dayOfWeek} />
      </section>
      <section className={styles.panel} aria-label="Hourly occupancy">
        <div className={styles.heading}>
          <h2>Busy hours</h2>
          <span style={{ fontSize: ".8rem" }}>IST</span>
        </div>
        <div className={styles.scroll}>
          <table className={styles.heatmap}>
            <caption className="emi-sr-only">
              Checked-in occupancy by day and hour
            </caption>
            <thead>
              <tr>
                <th scope="col">Day</th>
                {Array.from({ length: 10 }, (_, i) => (
                  <th scope="col" key={i}>
                    {i + 1} PM
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {report.heatmap.map((row) => (
                <tr key={row.day}>
                  <th scope="row">{row.label.slice(0, 3)}</th>
                  {row.cells.map((cell) => {
                    const detail = `${row.label}, ${cell.hour - 12}:00 PM: ${cell.percentage}% occupancy, ${occupancyHours(cell.occupiedMinutes)} / ${occupancyHours(cell.availableMinutes)} screen-hours, ${cell.bookingCount} check-ins`;
                    return (
                      <td key={cell.hour}>
                        {cell.availableMinutes > 0 ? (
                          <button
                            className={styles.cell}
                            type="button"
                            style={{
                              background: `rgba(0, 180, 220, ${0.04 + (cell.percentage / 100) * 0.55})`,
                            }}
                            aria-label={detail}
                            aria-describedby="occupancy-cell-detail"
                            onFocus={() => setSelected(detail)}
                            onClick={() => setSelected(detail)}
                          >
                            {cell.percentage}%
                          </button>
                        ) : (
                          <span aria-label="No reporting hours" />
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p
          id="occupancy-cell-detail"
          className={styles.detail}
          aria-live="polite"
        >
          {selected || "Select an hour to view details."}
        </p>
      </section>
    </>
  );
}
