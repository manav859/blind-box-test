export default function IndexPage() {
  return (
    <main className="ops-page">
      <section className="ops-page__panel">
        <span className="ops-page__eyebrow">Blind Box App</span>
        <h1>Configuration now lives in SHOPLINE admin.</h1>
        <p>
          This app no longer manages blind-box products, reward pools, or
          collection links from an embedded admin dashboard. Define the blind
          box directly on the SHOPLINE product using tags, then let the paid
          order webhook handle assignment and inventory execution.
        </p>
      </section>

      <section className="ops-page__grid">
        <article className="ops-page__card">
          <h2>Required product tags</h2>
          <ul className="ops-page__list">
            <li>
              <code>blind-box</code>
            </li>
            <li>
              <code>blind-box-collection:&lt;collection_handle&gt;</code>
            </li>
          </ul>
        </article>

        <article className="ops-page__card">
          <h2>Storefront behavior</h2>
          <p>
            The uploaded theme reads real SHOPLINE product and collection data.
            Blind-box products only show a short mystery-product note on the
            native product form.
          </p>
        </article>

        <article className="ops-page__card">
          <h2>Backend responsibilities</h2>
          <p>
            The backend stays webhook-only: detect tagged blind boxes, resolve
            the reward collection by handle, filter candidates, persist the
            assignment idempotently, and validate inventory in execute mode.
          </p>
        </article>
      </section>
    </main>
  );
}
