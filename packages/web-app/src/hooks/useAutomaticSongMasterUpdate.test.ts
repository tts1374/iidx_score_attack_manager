import { createRef, StrictMode, createElement } from 'react';
import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { SONG_MASTER_AUTO_CHECK_INTERVAL_MS, useAutomaticSongMasterUpdate } from './useAutomaticSongMasterUpdate';

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-10-22T00:00:00Z'));
  vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible');
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

function setup(enabled = true) {
  const update = vi.fn(async () => undefined);
  const lastCheckedAt = { current: null as number | null };
  const initialProps: { enabled: boolean; idle?: boolean } = { enabled };
  const hook = renderHook(({ enabled, idle = true }: { enabled: boolean; idle?: boolean }) => useAutomaticSongMasterUpdate(enabled, idle, update, lastCheckedAt), {
    initialProps,
  });
  return { update, lastCheckedAt, ...hook };
}

function resume() {
  act(() => {
    document.dispatchEvent(new Event('visibilitychange'));
    window.dispatchEvent(new Event('focus'));
  });
}

describe('automatic song master checks', () => {
  it('checks once on initial entry and suppresses duplicate resume events', () => {
    const { update } = setup();
    resume();
    expect(update).toHaveBeenCalledTimes(1);
    act(() => vi.advanceTimersByTime(SONG_MASTER_AUTO_CHECK_INTERVAL_MS - 1));
    resume();
    expect(update).toHaveBeenCalledTimes(1);
    act(() => vi.advanceTimersByTime(1));
    resume();
    expect(update).toHaveBeenCalledTimes(2);
  });

  it('does not poll while the screen stays open', () => {
    const { update } = setup();
    act(() => vi.advanceTimersByTime(24 * 60 * 60 * 1000));
    expect(update).toHaveBeenCalledTimes(1);
  });

  it('defers while outside home or operating and runs once when safe', () => {
    const { update, rerender } = setup(false);
    resume();
    expect(update).not.toHaveBeenCalled();
    rerender({ enabled: true });
    expect(update).toHaveBeenCalledTimes(1);
    rerender({ enabled: false });
    act(() => vi.advanceTimersByTime(SONG_MASTER_AUTO_CHECK_INTERVAL_MS));
    resume();
    expect(update).toHaveBeenCalledTimes(1);
    rerender({ enabled: true });
    expect(update).toHaveBeenCalledTimes(2);
  });

  it('defers initial and resumed checks while hidden', () => {
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden');
    const { update } = setup();
    resume();
    expect(update).not.toHaveBeenCalled();
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible');
    resume();
    expect(update).toHaveBeenCalledTimes(1);
  });

  it('respects a manual check within the interval', () => {
    const { update, lastCheckedAt, rerender } = setup(false);
    lastCheckedAt.current = Date.now();
    rerender({ enabled: true });
    resume();
    expect(update).not.toHaveBeenCalled();
  });

  it('retains a resume request during an operation and runs it after the operation', () => {
    const { update, rerender } = setup();
    rerender({ enabled: true, idle: false });
    act(() => vi.advanceTimersByTime(SONG_MASTER_AUTO_CHECK_INTERVAL_MS));
    resume();
    expect(update).toHaveBeenCalledTimes(1);
    rerender({ enabled: true, idle: true });
    expect(update).toHaveBeenCalledTimes(2);
  });

  it('does not check merely because a menu or operation closes without an entry/resume request', () => {
    const { update, rerender } = setup();
    rerender({ enabled: true, idle: false });
    act(() => vi.advanceTimersByTime(SONG_MASTER_AUTO_CHECK_INTERVAL_MS));
    rerender({ enabled: true, idle: true });
    expect(update).toHaveBeenCalledTimes(1);
  });

  it('cleans up listeners on unmount', () => {
    const { update, unmount } = setup();
    unmount();
    act(() => vi.advanceTimersByTime(SONG_MASTER_AUTO_CHECK_INTERVAL_MS));
    resume();
    expect(update).toHaveBeenCalledTimes(1);
  });

  it('deduplicates React StrictMode effects', () => {
    const update = vi.fn(async () => undefined);
    const lastCheckedAt = createRef<number | null>() as { current: number | null };
    renderHook(() => useAutomaticSongMasterUpdate(true, true, update, lastCheckedAt), {
      wrapper: ({ children }) => createElement(StrictMode, null, children),
    });
    expect(update).toHaveBeenCalledTimes(1);
  });
});
