import { act, renderHook, waitFor } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { useResource } from "./useResource";

it("keeps a loaded resource while a read retry fails", async () => {
  const loader = vi.fn().mockResolvedValue({ id: "document-a" });
  const { result } = renderHook(() => useResource(loader, "document-a"));
  await waitFor(() => expect(result.current.data).toEqual({ id: "document-a" }));
  loader.mockRejectedValue(new TypeError("network"));
  act(() => result.current.reload());
  await waitFor(() => expect(result.current.error).toBeInstanceOf(TypeError));
  expect(result.current.data).toEqual({ id: "document-a" });
  expect(loader).toHaveBeenCalledTimes(2);
});

it("does not present a previous document/account's cache after the resource identity changes", async () => {
  const loader = vi.fn().mockResolvedValue({ id: "document-a" });
  const { result, rerender } = renderHook(({ id }) => useResource(loader, id), { initialProps: { id: "document-a" } });
  await waitFor(() => expect(result.current.data).toEqual({ id: "document-a" }));
  loader.mockRejectedValue(new TypeError("network"));
  rerender({ id: "document-b" });
  expect(result.current.data).toBeNull();
  await waitFor(() => expect(result.current.loading).toBe(false));
  expect(result.current.data).toBeNull();
});
