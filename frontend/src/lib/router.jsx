// Minimal hash router: #/courses/IN2361 -> { name: 'course', params: { id: 'IN2361' } }.
// Hash routing keeps the Vite dev server and any static host working without rewrites.
import { useEffect, useState } from 'react';

const ROUTES = [
  { name: 'finder', pattern: /^\/?$/ },
  { name: 'matches', pattern: /^\/matches\/?$/ },
  { name: 'catalog', pattern: /^\/courses\/?$/ },
  { name: 'course', pattern: /^\/courses\/([^/]+)\/?$/, keys: ['id'] },
  { name: 'plan', pattern: /^\/plan\/?$/ },
  { name: 'profile', pattern: /^\/profile\/?$/ },
];

function parse(hash) {
  const [path, queryString = ''] = hash.replace(/^#/, '').split('?');
  const query = Object.fromEntries(new URLSearchParams(queryString));
  for (const r of ROUTES) {
    const m = path.match(r.pattern);
    if (m) {
      const params = Object.fromEntries((r.keys || []).map((k, i) => [k, decodeURIComponent(m[i + 1])]));
      return { name: r.name, params, query, path };
    }
  }
  return { name: 'notFound', params: {}, query, path };
}

export function useRoute() {
  const [route, setRoute] = useState(() => parse(window.location.hash));
  useEffect(() => {
    const onChange = () => {
      setRoute(parse(window.location.hash));
      window.scrollTo(0, 0);
    };
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  }, []);
  return route;
}

export function navigate(path) {
  window.location.hash = path;
}

export function Link({ to, className, children, ...rest }) {
  return (
    <a href={`#${to}`} className={className} {...rest}>
      {children}
    </a>
  );
}
