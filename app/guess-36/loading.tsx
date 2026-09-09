export default function Guess36Loading() {
  return (
    <main className="guess-36-page" aria-busy="true">
      <div className="guess-36-shell">
        <div className="loading-state guess-36-route-loading" role="status" aria-live="polite">
          <span className="spinner" aria-hidden="true" />
          <span>Loading Guess 36...</span>
        </div>
      </div>
    </main>
  );
}
