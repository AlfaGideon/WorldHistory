const request = async (path, options = {}) => {
  const response = await fetch(path, options);
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || `Ошибка API: ${response.status}`);
  return data;
};

export const searchHistory = (query, type = 'all') =>
  request(`/api/search?q=${encodeURIComponent(query)}&type=${encodeURIComponent(type)}`);

export const getDossier = (query) => request(`/api/dossier/${encodeURIComponent(query)}`);
