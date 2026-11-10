import Link from 'next/link';

export default function Landing() {
  return (
    <main className="app-canvas grid min-h-dvh place-items-center px-6">
      <Link href="/app" className="btn btn-primary">Open LIFEOS</Link>
    </main>
  );
}
