import { expect, it, vi } from "vitest";
import { backendControl, backendStatus, developerSession, developerSessionExpired } from "./localBackend";

it("coalesces status reads and invalidates old reads when a control operation starts", async () => {
  let oldResolve!: (response: Response) => void;
  let newResolve!: (response: Response) => void;
  const response = (state: string) => new Response(JSON.stringify({ state }));
  const fetcher = vi.fn()
    .mockImplementationOnce(() => new Promise<Response>((resolve) => { oldResolve = resolve; }))
    .mockResolvedValueOnce(response("stopped"))
    .mockImplementationOnce(() => new Promise<Response>((resolve) => { newResolve = resolve; }));
  vi.stubGlobal("fetch", fetcher);
  const old = backendStatus();
  expect(backendStatus()).toBe(old);
  await backendControl("stop");
  const fresh = backendStatus();
  expect(fresh).not.toBe(old);
  oldResolve(response("running"));
  await old;
  expect(backendStatus()).toBe(fresh);
  newResolve(response("stopped"));
  await expect(fresh).resolves.toMatchObject({ state: "stopped" });
  expect(fetcher).toHaveBeenCalledTimes(3);
});

it("sends developer credentials only to the local login endpoint and closes tools on control 401", async () => {
  const expired = vi.fn();
  window.addEventListener(developerSessionExpired, expired);
  const fetcher = vi.fn()
    .mockResolvedValueOnce(new Response(JSON.stringify({ user: { username: "developer" } })))
    .mockResolvedValueOnce(new Response(JSON.stringify({ error: "Vui lòng đăng nhập." }), { status: 401 }));
  vi.stubGlobal("fetch", fetcher);
  try {
    await developerSession("login", { username: "developer", password: "issued-password" });
    expect(fetcher).toHaveBeenNthCalledWith(1, "/__local/backend/login", expect.objectContaining({
      method: "POST", credentials: "same-origin", body: JSON.stringify({ username: "developer", password: "issued-password" }),
    }));
    await expect(backendControl("start")).rejects.toThrow("Vui lòng đăng nhập.");
    expect(expired).toHaveBeenCalledTimes(1);
  } finally { window.removeEventListener(developerSessionExpired, expired); }
});
