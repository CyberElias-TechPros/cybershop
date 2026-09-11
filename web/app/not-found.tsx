export default function NotFound() {
  return (
    <div className="empty">
      <h1>Page not found</h1>
      <p>
        The page you’re looking for doesn’t exist (or the business is no longer listed).{' '}
        <a href="/businesses">Browse businesses</a> instead.
      </p>
    </div>
  );
}
