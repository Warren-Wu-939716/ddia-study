import { Link } from 'react-router';

export function NotFound() {
  return (
    <div className="stack">
      <h1>Not found</h1>
      <p>
        That page doesn’t exist. <Link to="/">Back to today</Link>
      </p>
    </div>
  );
}
