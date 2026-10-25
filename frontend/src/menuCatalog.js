import { api } from "./api";

export async function loadMenuItems(filters = {}, options = {}) {
  const data = [];
  let page = 1;
  let lastPage;
  do {
    const query = new URLSearchParams({
      ...filters,
      per_page: "60",
      page: String(page),
    });
    const result = await api(`/menu/items?${query}`, options);
    data.push(...(result.data || []));
    lastPage = Number(result.last_page) || 1;
    page++;
  } while (page <= lastPage);
  return { data };
}
