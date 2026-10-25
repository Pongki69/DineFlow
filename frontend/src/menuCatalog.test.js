import { expect, it, vi } from "vitest";
import { api } from "./api";
import { loadMenuItems } from "./menuCatalog";

vi.mock("./api", () => ({ api: vi.fn() }));

it("loads every page of dishes while keeping category and search filters", async () => {
  api
    .mockResolvedValueOnce({ data: [{ id: 1 }], last_page: 2 })
    .mockResolvedValueOnce({ data: [{ id: 2 }], last_page: 2 });
  const signal = new AbortController().signal;
  expect(
    await loadMenuItems({ category: "inumin", q: "juice" }, { signal }),
  ).toEqual({ data: [{ id: 1 }, { id: 2 }] });
  expect(api).toHaveBeenNthCalledWith(
    1,
    "/menu/items?category=inumin&q=juice&per_page=60&page=1",
    { signal },
  );
  expect(api).toHaveBeenNthCalledWith(
    2,
    "/menu/items?category=inumin&q=juice&per_page=60&page=2",
    { signal },
  );
});
