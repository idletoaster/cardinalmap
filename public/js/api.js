// Tiny fetch wrapper. All endpoints live under /api.
async function jget(url) {
  const res = await fetch(url, { headers: { 'Accept': 'application/json' } });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`HTTP ${res.status}: ${text || res.statusText}`);
  }
  return res.json();
}
async function jpost(url, body, token) {
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}
export const api = {
  search:  (q)            => jget(`/api/search?q=${encodeURIComponent(q)}`),
  locate:  (lat, lon, label) => {
    const u = new URLSearchParams({ lat, lon });
    if (label) u.set('label', label);
    return jget(`/api/locate?${u}`);
  },
  direction: (lat, lon, dir, cats) => {
    const u = new URLSearchParams({ lat, lon, dir });
    if (cats && cats.length) u.set('cats', cats.join(','));
    return jget(`/api/direction?${u}`);
  },
  poi:     (id) => jget(`/api/poi/${id}`),
};
