import React from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import i18n, { ensureI18n } from '../i18n';
import { UnsupportedScreen, type StartupFailureKind } from './UnsupportedScreen';
import { ServiceWorkerFailureScreen } from './ServiceWorkerFailureScreen';

afterEach(cleanup);

describe.each(['ja', 'en', 'ko'] as const)('startup failure guidance (%s)', (language) => {
  it.each<StartupFailureKind>(['capabilities', 'other_tab', 'timeout', 'storage', 'unexpected', 'isolation'])(
    'shows the state and available action for %s with diagnostics behind keyboard-accessible help', async (kind) => {
      await ensureI18n(language);
      const user = userEvent.setup();
      const details = ['Web Locks API', 'OPFS', 'diagnostic/'.repeat(100)];
      render(<UnsupportedScreen kind={kind} reasons={details} />);
      expect(screen.getByRole('heading', { level: 1 }).textContent).toBe(i18n.t(`common.startup_failure.${kind}.title`));
      expect(screen.getByText(i18n.t(`common.startup_failure.${kind}.reason`))).toBeTruthy();
      expect(screen.getByText(i18n.t(`common.startup_failure.${kind}.action`))).toBeTruthy();
      expect(screen.queryByText('Web Locks API')).toBeNull();
      const help = screen.getByRole('button', { name: i18n.t('common.technical_info') });
      help.focus();
      await user.keyboard('{Enter}');
      const dialog = await screen.findByRole('dialog', { name: i18n.t('common.technical_info') });
      for (const detail of details) expect(within(dialog).getByText(detail)).toBeTruthy();
      await user.keyboard('{Escape}');
      await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
      expect(document.activeElement).toBe(help);
    },
  );

  it.each([{ reasons: [] }, { reasons: [''] }])('handles missing diagnostics: %j', async ({ reasons }) => {
    await ensureI18n(language);
    const user = userEvent.setup();
    render(<UnsupportedScreen kind="unexpected" reasons={reasons} />);
    await user.click(screen.getByRole('button', { name: i18n.t('common.technical_info') }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText(i18n.t('common.startup_failure.no_details'))).toBeTruthy();
  });

  it.each(['unsupported', 'register_error', 'controller_timeout'] as const)(
    'keeps the %s setup reason visible and the data loss warning together with deletion steps', async (reason) => {
      await ensureI18n(language);
      const user = userEvent.setup();
      render(<ServiceWorkerFailureScreen reason={reason} errorMessage={reason === 'register_error' ? 'network/'.repeat(100) : null} />);
      expect(screen.getByText(i18n.t(`common.service_worker_failure.reason.${reason}`))).toBeTruthy();
      expect(screen.getByText(i18n.t(`common.service_worker_failure.action.${reason}`))).toBeTruthy();
      const toggle = screen.getByRole('button', { name: i18n.t('common.service_worker_failure.guide_toggle') });
      expect(toggle.getAttribute('aria-expanded')).toBe('false');
      expect(screen.queryByRole('region')).toBeNull();
      toggle.focus();
      await user.keyboard(' ');
      const guide = screen.getByRole('region', { name: toggle.textContent! });
      expect(toggle.getAttribute('aria-controls')).toBe(guide.id);
      expect(within(guide).getByRole('heading', { name: i18n.t('common.service_worker_failure.delete_warning_title') })).toBeTruthy();
      const warning = within(guide).getByText(i18n.t('common.service_worker_failure.delete_warning'));
      const steps = within(guide).getByRole('list');
      expect(warning.compareDocumentPosition(steps) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
      expect(within(steps).getAllByRole('listitem')).toHaveLength(2);
      await user.keyboard(' ');
      expect(screen.queryByRole('region')).toBeNull();
      expect(document.activeElement).toBe(toggle);
      await user.click(toggle);
      expect(screen.getByRole('region')).toBeTruthy();
      const help = screen.getByRole('button', { name: i18n.t('common.technical_info') });
      await user.click(help);
      const dialog = await screen.findByRole('dialog');
      expect(within(dialog).getByText(i18n.t(`common.service_worker_failure.diagnostic.${reason}`))).toBeTruthy();
      if (reason === 'register_error') expect(within(dialog).getByText('network/'.repeat(100))).toBeTruthy();
      await user.click(within(dialog).getByRole('button', { name: i18n.t('common.close') }));
      await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
      expect(document.activeElement).toBe(help);
    },
  );
});
