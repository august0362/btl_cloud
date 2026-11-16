import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import { useToast } from '../hooks/useToast';
import { ToastProvider } from './ToastProvider';

function Controls() {
  const { show } = useToast();
  return <>
    <button onClick={() => show({ tone: 'warning', persist: true, message: 'Duplicate warning' })}>Warn</button>
    <button onClick={() => show({ tone: 'success', message: 'Normal success' })}>Success</button>
  </>;
}
it('keeps duplicate warnings until dismissed while normal success messages expire', () => {
  vi.useFakeTimers();
  const view = render(<ToastProvider><Controls /></ToastProvider>);
  try {
    fireEvent.click(screen.getByRole('button', { name: 'Warn' }));
    fireEvent.click(screen.getByRole('button', { name: 'Success' }));
    act(() => vi.advanceTimersByTime(6000));
    expect(screen.queryByText('Normal success')).not.toBeInTheDocument();
    const warning = screen.getByRole('alert');
    expect(warning).toHaveTextContent('Duplicate warning');
    expect(warning).toHaveClass('toast--warning');
    fireEvent.click(within(warning).getByRole('button', { name: 'Đóng thông báo' }));
    expect(screen.queryByText('Duplicate warning')).not.toBeInTheDocument();
  } finally { view.unmount(); vi.useRealTimers(); }
});
