"use client";
export default function OccupancyError({ reset }: { reset: () => void }) {
  return (
    <div className="card" style={{ padding: 24 }}>
      <h2>Could not load occupancy</h2>
      <button className="btn btn-primary" type="button" onClick={reset}>
        Try again
      </button>
    </div>
  );
}
