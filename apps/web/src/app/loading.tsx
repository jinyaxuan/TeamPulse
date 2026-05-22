export default function Loading() {
  return (
    <div className="tp-reveal-stack space-y-6">
      <section className="tp-marvis-stage overflow-hidden rounded-[28px]">
        <div className="grid gap-5 p-6 sm:p-8 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
          <div className="min-w-0">
            <div className="tp-skeleton h-7 w-28 rounded-full" />
            <div className="tp-skeleton mt-5 h-10 w-full max-w-xl rounded-full sm:h-12" />
            <div className="tp-skeleton mt-4 h-4 w-full max-w-2xl rounded-full" />
            <div className="tp-skeleton mt-2 h-4 w-2/3 max-w-lg rounded-full" />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="tp-skeleton h-10 w-24 rounded-full" />
            <div className="tp-skeleton h-10 w-28 rounded-full" />
          </div>
        </div>
      </section>

      <section className="tp-reveal-list grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <div key={index} className="tp-panel overflow-hidden rounded-[24px] p-5">
            <div className="flex items-center justify-between gap-3">
              <div className="tp-skeleton h-1.5 w-10 rounded-full" />
              <div className="tp-skeleton h-2 w-2 rounded-full" />
            </div>
            <div className="tp-skeleton mt-5 h-3 w-20 rounded-full" />
            <div className="tp-skeleton mt-3 h-9 w-24 rounded-full" />
            <div className="tp-skeleton mt-3 h-3 w-32 rounded-full" />
          </div>
        ))}
      </section>

      <section className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_380px]">
        <div className="tp-panel overflow-hidden rounded-[24px]">
          <div className="border-b border-black/[0.05] bg-white/60 px-5 py-4">
            <div className="tp-skeleton h-5 w-32 rounded-full" />
            <div className="tp-skeleton mt-2 h-3 w-64 rounded-full" />
          </div>
          <div className="tp-reveal-list space-y-3 p-4">
            {Array.from({ length: 5 }).map((_, index) => (
              <div key={index} className="rounded-[22px] border border-black/[0.04] bg-white/80 p-4">
                <div className="flex items-start gap-3">
                  <div className="tp-skeleton h-11 w-11 shrink-0 rounded-full" />
                  <div className="min-w-0 flex-1">
                    <div className="tp-skeleton h-4 w-1/2 rounded-full" />
                    <div className="tp-skeleton mt-3 h-3 w-full rounded-full" />
                    <div className="tp-skeleton mt-2 h-3 w-2/3 rounded-full" />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <aside className="tp-panel overflow-hidden rounded-[24px] p-5">
          <div className="tp-skeleton h-5 w-28 rounded-full" />
          <div className="tp-reveal-list mt-4 space-y-3">
            {Array.from({ length: 4 }).map((_, index) => (
              <div key={index} className="rounded-[22px] bg-white p-4">
                <div className="tp-skeleton h-4 w-3/4 rounded-full" />
                <div className="tp-skeleton mt-3 h-3 w-full rounded-full" />
                <div className="tp-skeleton mt-2 h-3 w-1/2 rounded-full" />
              </div>
            ))}
          </div>
        </aside>
      </section>
    </div>
  );
}
