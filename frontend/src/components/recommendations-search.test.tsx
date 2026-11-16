import { act, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SearchBar } from './SearchBar';

const mount = (loadSuggestions: (q: string, signal: AbortSignal) => Promise<{ items: { documentId: string; title: string }[] }>, onChange = vi.fn()) => render(<MemoryRouter><Routes><Route path="/" element={<SearchBar filters={{}} onChange={onChange} loadSuggestions={loadSuggestions} />} /><Route path="/documents/:id" element={<h1>Selected document</h1>} /></Routes></MemoryRouter>);
afterEach(() => vi.useRealTimers());
describe('recommendation combobox', () => {
  it('debounces250ms, aborts old request, ignores stale results, uses keyboard to navigate', async () => {
    vi.useFakeTimers(); let resolveFirst!: (value: { items: { documentId: string; title: string }[] }) => void;
    const signals: AbortSignal[] = [];
    const loader = vi.fn((q: string, signal: AbortSignal) => { signals.push(signal); return q === 'aw' ? new Promise<{ items: { documentId: string; title: string }[] }>((resolve) => { resolveFirst = resolve; }) : Promise.resolve({ items: [{ documentId: '2', title: 'AWS S3' }] }); });
    mount(loader); const input = screen.getByRole('combobox', { name: 'Tìm theo tiêu đề hoặc mô tả' });
    fireEvent.change(input, { target: { value: 'aw' } }); await act(async () => { await vi.advanceTimersByTimeAsync(249); }); expect(loader).not.toHaveBeenCalled();
    await act(async () => { await vi.advanceTimersByTimeAsync(1); }); expect(loader).toHaveBeenCalledTimes(1);
    fireEvent.change(input, { target: { value: 'aws' } }); expect(signals[0]!.aborted).toBe(true);
    await act(async () => { await vi.advanceTimersByTimeAsync(250); }); expect(screen.getByRole('option', { name: 'AWS S3' })).toHaveTextContent('AWS S3');
    await act(async () => { resolveFirst({ items: [{ documentId: '1', title: 'Stale response' }] }); }); expect(screen.queryByText('Stale response')).not.toBeInTheDocument();
    fireEvent.keyDown(input, { key: 'ArrowDown' }); expect(input).toHaveAttribute('aria-activedescendant'); expect(screen.getByRole('option', { name: 'AWS S3' })).toHaveAttribute('aria-selected', 'true');
    fireEvent.keyDown(input, { key: 'Enter' }); expect(screen.getByRole('heading')).toHaveTextContent('Selected document');
  });
  it('Esc dismisses, error/429 hides, unselected Enter searches, mine does not request', async () => {
    vi.useFakeTimers(); const loader = vi.fn().mockResolvedValue({ items: [{ documentId: '1', title: 'AWS' }] }); const onChange = vi.fn();
    const rendered = mount(loader, onChange); const input = screen.getByRole('combobox', { name: 'Tìm theo tiêu đề hoặc mô tả' });
    fireEvent.change(input, { target: { value: 'aws' } }); await act(async () => { await vi.advanceTimersByTimeAsync(250); });
    fireEvent.keyDown(input, { key: 'Escape' }); expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    loader.mockRejectedValue(new Error('429')); fireEvent.change(input, { target: { value: 'aws2' } }); await act(async () => { await vi.advanceTimersByTimeAsync(250); }); expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    fireEvent.submit(input.closest('form')!); expect(onChange).toHaveBeenCalledWith({ q: 'aws2', page: 1 }); rendered.unmount();
    render(<MemoryRouter><SearchBar mine filters={{}} onChange={onChange} loadSuggestions={loader} /></MemoryRouter>);
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'mine' } }); await act(async () => { await vi.advanceTimersByTimeAsync(500); }); expect(loader).toHaveBeenCalledTimes(2);
  });
});
