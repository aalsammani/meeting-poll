import { Link } from "react-router-dom";

export default function NotFound() {
  return (
    <div className="mx-auto max-w-xl space-y-4 py-12">
      <h1 className="text-3xl">This page doesn't exist</h1>
      <p className="text-ink-soft">
        Check that the link was copied completely. Poll links look like <code className="text-[15px]">/p/…</code>{" "}
        followed by a long id.
      </p>
      <Link to="/" className="inline-block text-ink underline underline-offset-4">Go to the start page</Link>
    </div>
  );
}
