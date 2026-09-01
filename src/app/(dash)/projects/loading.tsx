export default function Loading() {
  return (
    <div>
      <div className="skeleton mb-5" style={{ height: 34, width: 200 }} />
      <div className="skeleton mb-6" style={{ height: 44, width: 360, borderRadius: 999 }} />
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="skeleton" style={{ height: 210 }} />
        ))}
      </div>
    </div>
  );
}
