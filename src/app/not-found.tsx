import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="flex items-center justify-center px-4" style={{ minHeight: '100dvh' }}>
      <div className="text-center">
        <div className="font-display grad-text" style={{ fontSize: 96, lineHeight: 1 }}>404</div>
        <h1 className="font-display mt-2" style={{ fontSize: 24, color: 'var(--txt)' }}>Page not found</h1>
        <p className="text-[13.5px] mt-2" style={{ color: 'var(--muted)' }}>That page doesn’t exist or has moved.</p>
        <Link href="/projects" className="btn-grad inline-flex mt-6">Back to dashboard</Link>
      </div>
    </div>
  );
}
