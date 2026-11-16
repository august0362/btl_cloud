import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { HomePage } from './DocumentListPages';
import { recommendationsApi } from '../api/recommendations';
import { documentsApi } from '../api/documents';
import { documentFixture, pageOf } from '../test/fixtures';
const state = vi.hoisted(() => ({ user: null as { id: string } | null }));
vi.mock('../auth/context', () => ({ useAuth: () => ({ user: state.user }) }));
vi.mock('../api/recommendations', () => ({ recommendationsApi: { home: vi.fn(), getSettings: vi.fn(), putSettings: vi.fn(), deleteHistory: vi.fn(), suggestions: vi.fn() } }));
vi.mock('../api/documents', () => ({ documentsApi: { searchPublic: vi.fn() } }));
const api = vi.mocked(recommendationsApi);
const mount = (path = '/') => render(<MemoryRouter initialEntries={[path]}><HomePage /></MemoryRouter>);
beforeEach(() => {
  vi.resetAllMocks(); state.user = null;
  vi.mocked(documentsApi.searchPublic).mockResolvedValue(pageOf([]));
  api.home.mockResolvedValue({ strategy: 'NEWEST', items: [{ document: documentFixture, reason: 'NEW' }] });
  api.getSettings.mockResolvedValue({ personalizationEnabled: false, historyItems: 0 });
});
describe('recommendation home privacy controls', () => {
  it('guest sees recommendations without invitation; failed recommendations leave main page usable', async () => {
    const view = mount(); expect(await screen.findByText('Tài liệu nổi bật')).toBeInTheDocument(); expect(screen.queryByRole('button', { name: 'Bật' })).not.toBeInTheDocument(); expect(api.getSettings).not.toHaveBeenCalled(); view.unmount();
    api.home.mockRejectedValue(new Error('offline')); mount(); expect(await screen.findByText('Chưa có tài liệu công khai nào.')).toBeInTheDocument(); expect(screen.queryByText('Tài liệu nổi bật')).not.toBeInTheDocument();
  });
  it('requires visible privacy explanation before confirming opt-in, permits disable and history deletion', async () => {
    state.user = { id: 'viewer' }; const view = mount();
    fireEvent.click(await screen.findByRole('button', { name: 'Bật' })); expect(api.putSettings).not.toHaveBeenCalled();
    expect(screen.getByText(/Khi bật, hệ thống lưu tài liệu bạn xem và tải trong 90 ngày/)).toBeInTheDocument();
    api.putSettings.mockResolvedValue({ personalizationEnabled: true, historyItems: 0 }); api.getSettings.mockResolvedValue({ personalizationEnabled: true, historyItems: 2 });
    fireEvent.click(screen.getByRole('switch')); await waitFor(() => expect(api.putSettings).toHaveBeenCalledWith(true));
    fireEvent.click(await screen.findByRole('button', { name: 'Tuỳ chọn gợi ý' })); api.deleteHistory.mockResolvedValue(); fireEvent.click(screen.getByRole('button', { name: 'Xoá lịch sử' })); await waitFor(() => expect(api.deleteHistory).toHaveBeenCalled());
    api.putSettings.mockResolvedValue({ personalizationEnabled: false, historyItems: 0 }); fireEvent.click(screen.getByRole('switch')); await waitFor(() => expect(api.putSettings).toHaveBeenCalledWith(false)); view.unmount();
  });
  it('defaults public queries to relevance, honors explicit sort, no home section during search', async () => {
    const view = mount('/?q=AWS'); await waitFor(() => expect(documentsApi.searchPublic).toHaveBeenCalledWith(expect.objectContaining({ q: 'AWS', sort: 'relevance' }), expect.any(AbortSignal))); expect(api.home).not.toHaveBeenCalled(); view.unmount();
    mount('/?q=AWS&sort=newest'); await waitFor(() => expect(documentsApi.searchPublic).toHaveBeenLastCalledWith(expect.objectContaining({ sort: 'newest' }), expect.any(AbortSignal)));
  });
});
