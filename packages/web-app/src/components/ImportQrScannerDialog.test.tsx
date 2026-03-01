import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { ImportQrScannerDialog } from './ImportQrScannerDialog';

type MockTrack = {
  stop: ReturnType<typeof vi.fn>;
};

function createMockStream(): { stream: MediaStream; track: MockTrack } {
  const track: MockTrack = {
    stop: vi.fn(),
  };
  const stream = {
    getTracks: () => [track],
  } as unknown as MediaStream;
  return { stream, track };
}

describe('ImportQrScannerDialog', () => {
  const originalSecureContext = window.isSecureContext;
  const originalMediaDevices = navigator.mediaDevices;
  let getUserMediaMock: ReturnType<typeof vi.fn>;
  let playSpy: { mockRestore: () => void };
  let pauseSpy: { mockRestore: () => void };
  let requestAnimationFrameSpy: { mockRestore: () => void };
  let cancelAnimationFrameSpy: { mockRestore: () => void };

  beforeEach(() => {
    Object.defineProperty(window, 'isSecureContext', {
      configurable: true,
      value: true,
    });
    getUserMediaMock = vi.fn();
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: {
        getUserMedia: getUserMediaMock,
      },
    });
    playSpy = vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined);
    pauseSpy = vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => undefined);
    requestAnimationFrameSpy = vi.spyOn(window, 'requestAnimationFrame').mockImplementation(() => 1);
    cancelAnimationFrameSpy = vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => undefined);
  });

  afterEach(() => {
    cleanup();
    playSpy.mockRestore();
    pauseSpy.mockRestore();
    requestAnimationFrameSpy.mockRestore();
    cancelAnimationFrameSpy.mockRestore();
    Object.defineProperty(window, 'isSecureContext', {
      configurable: true,
      value: originalSecureContext,
    });
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: originalMediaDevices,
    });
  });

  it('shows QR scanner UI on camera startup success', async () => {
    const { stream } = createMockStream();
    getUserMediaMock.mockResolvedValue(stream);

    render(<ImportQrScannerDialog open onClose={() => undefined} onImportUrl={() => undefined} />);

    await waitFor(() => expect(getUserMediaMock).toHaveBeenCalledTimes(1));
    expect(screen.getByText('QRコードをカメラにかざしてください。')).toBeTruthy();
    expect(screen.queryByText('カメラが利用できません')).toBeNull();
    expect(screen.queryByPlaceholderText('インポート用URLを貼り付け')).toBeNull();
    expect(screen.queryByRole('button', { name: '原因と対処' })).toBeNull();
  });

  it('shows URL fallback and help accordion when camera startup fails', async () => {
    getUserMediaMock.mockRejectedValue(new DOMException('Permission denied', 'NotAllowedError'));

    render(<ImportQrScannerDialog open onClose={() => undefined} onImportUrl={() => undefined} />);

    await screen.findByText('カメラが利用できません');
    expect(document.body.querySelector('.importQrScannerViewport')).toBeNull();
    expect(screen.getByText('投稿のリンクを開くか、インポート用URLを貼り付けてください。')).toBeTruthy();
    expect(screen.getByPlaceholderText('インポート用URLを貼り付け')).toBeTruthy();
    const helpButton = screen.getByRole('button', { name: '原因と対処' });
    expect(helpButton).toBeTruthy();

    await userEvent.click(helpButton);
    expect(screen.getByText('ブラウザのカメラ権限を許可してください')).toBeTruthy();
    expect(screen.getByText('HTTPSで開いてください')).toBeTruthy();
    expect(screen.getByText('SNS内ブラウザでは動かない場合があります')).toBeTruthy();
    expect(document.body.querySelector('.importQrScannerFallbackHelpPanel')?.children.length).toBe(3);
  });

  it('validates fallback URL input and keeps value on failure', async () => {
    getUserMediaMock.mockRejectedValue(new DOMException('Permission denied', 'NotAllowedError'));
    const onImportUrl = vi.fn();

    render(<ImportQrScannerDialog open onClose={() => undefined} onImportUrl={onImportUrl} />);
    await screen.findByText('カメラが利用できません');

    const importButton = screen.getByRole('button', { name: '取り込む' }) as HTMLButtonElement;
    expect(importButton.disabled).toBe(true);

    const input = screen.getByPlaceholderText('インポート用URLを貼り付け') as HTMLInputElement;
    await userEvent.type(input, 'abc');
    expect(importButton.disabled).toBe(false);

    await userEvent.click(importButton);
    expect(screen.getByText('http(s):// で始まるURLを入力してください。')).toBeTruthy();
    expect(input.value).toBe('abc');
    expect(onImportUrl).toHaveBeenCalledTimes(0);

    await userEvent.clear(input);
    await userEvent.type(input, 'https://example.com/path?p=abc');
    await userEvent.click(importButton);
    expect(screen.getByText('インポート用URLを入力してください。')).toBeTruthy();
    expect(input.value).toBe('https://example.com/path?p=abc');
    expect(onImportUrl).toHaveBeenCalledTimes(0);

    await userEvent.clear(input);
    await userEvent.type(input, ' https://example.com/import/confirm?p=abc%2Bdef ');
    await userEvent.click(importButton);
    expect(onImportUrl).toHaveBeenCalledTimes(1);
    expect(onImportUrl).toHaveBeenCalledWith('https://example.com/import/confirm?p=abc%2Bdef');
  });

  it('stops camera stream tracks when dialog is closed', async () => {
    const { stream, track } = createMockStream();
    getUserMediaMock.mockResolvedValue(stream);

    const { rerender } = render(<ImportQrScannerDialog open onClose={() => undefined} onImportUrl={() => undefined} />);
    await waitFor(() => expect(getUserMediaMock).toHaveBeenCalledTimes(1));

    rerender(<ImportQrScannerDialog open={false} onClose={() => undefined} onImportUrl={() => undefined} />);

    await waitFor(() => expect(track.stop).toHaveBeenCalledTimes(1));
    expect(cancelAnimationFrameSpy).toHaveBeenCalled();
  });
});
