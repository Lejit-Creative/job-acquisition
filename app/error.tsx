"use client";

export default function Error({ error, reset }: { error: Error; reset: () => void }) {
  return (
    <section className="list-card cream" style={{ marginTop: 20 }}>
      <h2>Something went wrong</h2>
      <p className="meta">{error.message}</p>
      <button type="button" className="btn" onClick={reset}>
        Try again
      </button>
    </section>
  );
}
