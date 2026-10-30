import "./overview-loading.css";
export function OverviewSkeleton() {
  return (
    <section
      className="overview-skeleton"
      role="status"
      aria-label="Loading business overview"
    >
      <span className="sr-only">Loading your business overview…</span>
      <div className="intel-kpi-grid" aria-hidden="true">
        {Array.from({ length: 4 }, (_, i) => (
          <div className="intel-kpi" key={i}>
            <i className="overview-placeholder skeleton-label" />
            <i className="overview-placeholder skeleton-value" />
            <i className="overview-placeholder skeleton-note" />
          </div>
        ))}
      </div>
      <div className="overview-skeleton-chart" aria-hidden="true">
        <i className="overview-placeholder skeleton-heading" />
        <div className="overview-skeleton-bars">
          {[45, 70, 55, 85, 65, 92, 76, 60, 80, 67, 95, 72].map((height, i) => (
            <i
              className="overview-placeholder"
              style={{ height: `${height}%` }}
              key={i}
            />
          ))}
        </div>
        <i className="overview-placeholder skeleton-note" />
      </div>
      <div className="overview-skeleton-details" aria-hidden="true">
        {[0, 1].map((n) => (
          <div key={n}>
            <i className="overview-placeholder skeleton-heading" />
            {[0, 1, 2].map((i) => (
              <i className="overview-placeholder skeleton-row" key={i} />
            ))}
          </div>
        ))}
      </div>
    </section>
  );
}
