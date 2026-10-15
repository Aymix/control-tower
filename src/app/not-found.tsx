import Link from "next/link";

export default function NotFound() {
  return (
    <div className="min-h-screen grid place-items-center p-6">
      <div className="text-center space-y-2">
        <div className="text-4xl font-semibold tracking-tight">404</div>
        <p className="text-muted-foreground">That page does not exist or you do not have access to it.</p>
        <Link href="/inbox" className="underline text-sm">Back to inbox</Link>
      </div>
    </div>
  );
}
