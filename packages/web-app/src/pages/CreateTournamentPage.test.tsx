import React from 'react';
import type { ComponentProps } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PAYLOAD_VERSION, buildTournamentDefHash } from '@iidx/shared';

import { CreateTournamentPage } from './CreateTournamentPage';
import { buildCreateTournamentInput, type CreateTournamentDraft } from './create-tournament-draft';
import i18n from '../i18n';

const mocks = vi.hoisted(() => ({ search: vi.fn(), charts: vi.fn() }));
vi.mock('../services/context', () => ({
  useAppServices: () => ({ appDb: { searchSongsByPrefix: mocks.search, getChartsByMusicAndStyle: mocks.charts } }),
}));

const song = { musicId: 2001, title: 'Sample song', version: '31' };
const chart = { chartId: 1001, musicId: 2001, playStyle: 'SP', difficulty: 'HYPER', level: '10', isActive: 1 };
const dpChart = { ...chart, chartId: 1002, playStyle: 'DP', difficulty: 'ANOTHER', level: '12' };
type Props = ComponentProps<typeof CreateTournamentPage>;

function makeDraft(complete = false): CreateTournamentDraft {
  return {
    tournamentUuid: '334b1da7-305b-4b77-93c4-d9222f58068b', name: 'November score attack', owner: '', hashtag: 'November',
    startDate: '2026-11-09', endDate: '2026-11-30',
    rows: [{ key: 'row1', query: complete ? song.title : '', options: [], selectedSong: complete ? song : null,
      playStyle: 'SP', chartOptions: complete ? [chart] : [], selectedChartId: complete ? chart.chartId : null, loading: false }],
  };
}

function renderCreate(initialDraft = makeDraft(), overrides: Partial<Props> = {}) {
  let latestDraft = initialDraft;
  const onConfirmCreate = vi.fn(async () => undefined);
  const props = { todayDate: '2026-11-09', saving: false, errorMessage: null, debugModeEnabled: false, onConfirmCreate, ...overrides };
  function Harness() {
    const [draft, setDraft] = React.useState(initialDraft);
    latestDraft = draft;
    return <CreateTournamentPage {...props} draft={draft} onDraftChange={setDraft} />;
  }
  return { ...render(<Harness />), props, getDraft: () => latestDraft };
}

function nav(index: number, step: 'basic' | 'charts' | 'confirm') {
  return screen.getByRole('button', { name: i18n.t('create_tournament.wizard.nav_item', {
    index, label: i18n.t(`create_tournament.wizard.step.${step}`),
  }) });
}

function next(step: 'charts' | 'confirm') {
  return screen.getByRole('button', { name: i18n.t('create_tournament.action.next_with_step', {
    action: i18n.t('common.next'), step: i18n.t(`create_tournament.wizard.step.${step}`),
  }) });
}

beforeEach(() => {
  vi.stubGlobal('scrollTo', vi.fn());
  Element.prototype.scrollIntoView = vi.fn();
  mocks.search.mockResolvedValue([song]);
  mocks.charts.mockImplementation(async (_musicId, style) => style === 'DP' ? [dpChart] : [chart]);
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe('CreateTournamentPage guidance', () => {
  it('counts missing basic fields, groups the dates as one field, and keeps the next step disabled', async () => {
    const user = userEvent.setup();
    renderCreate({ ...makeDraft(), name: '', hashtag: '', startDate: '', endDate: '' });
    expect(screen.getByRole('status').textContent).toBe(i18n.t('create_tournament.status.basic_missing', { count: 3 }));
    expect((next('charts') as HTMLButtonElement).disabled).toBe(true);
    await user.type(screen.getByRole('textbox', { name: new RegExp(i18n.t('create_tournament.field.name.label_plain')) }), 'New name');
    await user.tab();
    expect(screen.getByRole('status').textContent).toBe(i18n.t('create_tournament.status.basic_missing', { count: 1 }));
    expect(screen.getAllByText(i18n.t('create_tournament.validation.start_date_required')).length).toBeGreaterThan(0);
    expect(screen.getAllByText(i18n.t('create_tournament.validation.end_date_required')).length).toBeGreaterThan(0);
  });

  it.each(['2026-11-08', '2026-11-10'])('shows the period error, rather than completion, for end date %s', (startDate) => {
    const draft = { ...makeDraft(), startDate, endDate: '2026-11-08' };
    renderCreate(draft);
    const key = startDate > draft.endDate ? 'end_date_after_start' : 'end_date_from_today';
    expect(screen.getByRole('status').textContent).toBe(i18n.t(`create_tournament.validation.${key}`));
    expect((next('charts') as HTMLButtonElement).disabled).toBe(true);
    expect(screen.queryByText(i18n.t('create_tournament.status.completed'))).toBeNull();
  });

  it('shows valid basic info as complete and allows the chart step', () => {
    renderCreate();
    expect(screen.getByRole('status').textContent).toBe(i18n.t('create_tournament.status.completed'));
    expect((next('charts') as HTMLButtonElement).disabled).toBe(false);
  });

  it('gives one song-first instruction for four rows and keeps row numbers, limits, and error navigation', async () => {
    const user = userEvent.setup();
    const draft = makeDraft();
    draft.rows = [1, 2, 3, 4].map((index) => ({ ...draft.rows[0]!, key: `row${index}` }));
    renderCreate(draft);
    await user.click(nav(2, 'charts'));
    expect(screen.getAllByText(i18n.t('create_tournament.chart.select_song_hint')).length).toBe(1);
    expect(screen.getByRole('status').textContent).toBe(i18n.t('create_tournament.status.charts_missing', { count: 4 }));
    expect(screen.getByText(i18n.t('create_tournament.chart.row_count', { count: 4, max: 4 }))).toBeTruthy();
    expect((screen.getByRole('button', { name: i18n.t('create_tournament.chart.add') }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getAllByRole('radio').every((radio) => (radio as HTMLInputElement).disabled)).toBe(true);
    expect(screen.getByRole('combobox', { name: i18n.t('create_tournament.chart.song_search_aria', { index: 4 }) })).toBeTruthy();
    await user.click(next('confirm'));
    expect(screen.getAllByText(i18n.t('create_tournament.validation.chart_song_required')).length).toBe(4);
    expect(Element.prototype.scrollIntoView).toHaveBeenCalled();
    expect(nav(2, 'charts').getAttribute('aria-current')).toBe('step');
    await user.click(screen.getByRole('button', { name: i18n.t('create_tournament.chart.selection_delete_aria', { index: 4 }) }));
    expect((screen.getByRole('button', { name: i18n.t('create_tournament.chart.add') }) as HTMLButtonElement).disabled).toBe(false);
  });

  it('retains search, song selection, difficulty requirement, SP/DP switching, and selected chart values', async () => {
    const user = userEvent.setup();
    const view = renderCreate();
    await user.click(nav(2, 'charts'));
    const search = screen.getByRole('combobox', { name: i18n.t('create_tournament.chart.song_search_aria', { index: 1 }) });
    await user.type(search, 'Sample');
    await user.click(await screen.findByRole('option', { name: /Sample song/ }));
    await screen.findByRole('button', { name: 'H 10' });
    expect(screen.queryByText(i18n.t('create_tournament.chart.select_song_hint'))).toBeNull();
    expect(screen.getAllByRole('radio').every((radio) => !(radio as HTMLInputElement).disabled)).toBe(true);
    await user.click(next('confirm'));
    expect(screen.getByText(i18n.t('create_tournament.validation.chart_difficulty_required_row'))).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'H 10' }));
    expect(view.getDraft().rows[0]?.selectedChartId).toBe(1001);
    await user.click(screen.getByRole('radio', { name: 'DP' }));
    await screen.findByRole('button', { name: 'A 12' });
    await waitFor(() => expect(view.getDraft().rows[0]?.selectedChartId).toBeNull());
    await user.click(screen.getByRole('button', { name: 'A 12' }));
    expect(view.getDraft().rows[0]?.selectedChartId).toBe(1002);
    await user.click(next('confirm'));
    expect(screen.getByText('DP ANOTHER 12')).toBeTruthy();
    expect(screen.getByText(i18n.t('create_tournament.confirm.chart_count', { count: 1 }))).toBeTruthy();
  });

  it('keeps unavailable chart and other-row usage remedies visible with duplicate choices disabled', async () => {
    const user = userEvent.setup();
    const draft = makeDraft(true);
    draft.rows.push({ ...draft.rows[0]!, key: 'row2', selectedChartId: null });
    draft.rows.push({ ...draft.rows[0]!, key: 'row3', chartOptions: [], selectedChartId: null });
    renderCreate(draft);
    await user.click(nav(2, 'charts'));
    expect(screen.getByText(i18n.t('create_tournament.field.difficulty.no_available'))).toBeTruthy();
    expect(screen.getByText(i18n.t('create_tournament.field.difficulty.used_in_other'))).toBeTruthy();
    expect((screen.getAllByRole('button', { name: 'H 10' })[1] as HTMLButtonElement).disabled).toBe(true);
    await user.click(next('confirm'));
    expect(nav(2, 'charts').getAttribute('aria-current')).toBe('step');
  });

  it('does not report completion for duplicate charts and scrolls to the affected row', async () => {
    const user = userEvent.setup();
    const draft = makeDraft(true);
    draft.rows.push({ ...draft.rows[0]!, key: 'row2' });
    renderCreate(draft);
    await user.click(nav(2, 'charts'));
    expect(screen.getByRole('status').textContent).toBe(i18n.t('create_tournament.validation.chart_duplicate'));
    expect(screen.getAllByText(i18n.t('create_tournament.validation.chart_duplicate_on_page')).length).toBe(2);
    await user.click(next('confirm'));
    expect(Element.prototype.scrollIntoView).toHaveBeenCalled();
    expect((nav(3, 'confirm') as HTMLButtonElement).disabled).toBe(true);
  });

  it.each(['ja', 'en', 'ko'] as const)('preserves ID meaning, copy feedback, and keyboard help in %s', async (language) => {
    await i18n.changeLanguage(language);
    const user = userEvent.setup();
    const clipboard = vi.spyOn(navigator.clipboard, 'writeText').mockResolvedValue();
    const draft = makeDraft(true);
    const view = renderCreate(draft);
    await user.click(nav(3, 'confirm'));
    const help = screen.getByRole('button', { name: i18n.t('create_tournament.confirm.tournament_id_help') });
    expect(screen.queryByRole('button', { name: i18n.t('create_tournament.confirm.copy_tournament_id') })).toBeNull();
    expect(screen.queryByText(i18n.t('create_tournament.confirm.debug.title'))).toBeNull();
    help.focus();
    await user.keyboard('{Enter}');
    const dialog = await screen.findByRole('dialog', { name: i18n.t('create_tournament.confirm.tournament_id_help') });
    const expectedHash = buildTournamentDefHash({ v: PAYLOAD_VERSION, uuid: draft.tournamentUuid, name: draft.name,
      owner: '', hashtag: draft.hashtag, start: draft.startDate, end: draft.endDate, charts: [1001] });
    expect(within(dialog).getByText(`${expectedHash.slice(0, 30)}…`)).toBeTruthy();
    await user.click(within(dialog).getByRole('button', { name: i18n.t('create_tournament.confirm.copy_tournament_id') }));
    expect(clipboard).toHaveBeenCalledWith(expectedHash);
    expect((await within(dialog).findByRole('alert')).textContent).toBe(i18n.t('create_tournament.confirm.tournament_id_copied'));
    clipboard.mockRejectedValueOnce(new Error('denied'));
    await user.click(within(dialog).getByRole('button', { name: i18n.t('create_tournament.confirm.copy_tournament_id') }));
    await waitFor(() => expect(within(dialog).getByRole('alert').textContent).toBe(i18n.t('create_tournament.confirm.tournament_id_copy_failed')));
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(document.activeElement).toBe(help);
    expect(view.getDraft()).toEqual(draft);
    await user.click(nav(2, 'charts'));
    expect(screen.getByText(i18n.t('create_tournament.chart.row_count', { count: 1, max: 4 }))).toBeTruthy();
    expect(screen.getByRole('combobox', { name: i18n.t('create_tournament.chart.song_search_aria', { index: 1 }) })).toBeTruthy();
    expect(screen.getByRole('status').textContent).toBe(i18n.t('create_tournament.status.charts_completed'));
  });

  it('retains the draft and creation input through both edit links and confirmation', async () => {
    const user = userEvent.setup();
    const draft = makeDraft(true);
    const view = renderCreate(draft);
    await user.click(nav(3, 'confirm'));
    await user.click(screen.getByRole('button', { name: i18n.t('create_tournament.confirm.edit_basic_info') }));
    await user.click(next('charts'));
    await user.click(next('confirm'));
    await user.click(screen.getByRole('button', { name: i18n.t('create_tournament.confirm.edit_chart_list') }));
    await user.click(next('confirm'));
    expect(screen.getByText(i18n.t('create_tournament.confirm.final_notice'))).toBeTruthy();
    await user.click(screen.getByRole('button', { name: i18n.t('create_tournament.action.finalize') }));
    expect(view.props.onConfirmCreate).toHaveBeenCalledTimes(1);
    expect(buildCreateTournamentInput(view.getDraft(), [1001])).toEqual(buildCreateTournamentInput(draft, [1001]));
    expect(view.getDraft()).toEqual(draft);
  });

  it.each([false, true])('keeps debug visibility gated by debug mode %s', async (debugModeEnabled) => {
    const user = userEvent.setup();
    renderCreate(makeDraft(true), { debugModeEnabled });
    await user.click(nav(3, 'confirm'));
    expect(Boolean(screen.queryByText(i18n.t('create_tournament.confirm.debug.title')))).toBe(debugModeEnabled);
  });

  it('preserves pending-operation guards and the final warning', async () => {
    const user = userEvent.setup();
    const view = renderCreate(makeDraft(true), { saving: true });
    await user.click(nav(3, 'confirm'));
    const button = screen.getByRole('button', { name: i18n.t('create_tournament.action.finalize') });
    expect((button as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText(i18n.t('create_tournament.confirm.final_notice'))).toBeTruthy();
    await user.click(button);
    expect(view.props.onConfirmCreate).not.toHaveBeenCalled();
  });

  it('keeps creation failures and the unchanged input available for retry', async () => {
    const user = userEvent.setup();
    const draft = makeDraft(true);
    const view = renderCreate(draft, { errorMessage: 'Creation failed' });
    await user.click(nav(3, 'confirm'));
    expect(screen.getByText('Creation failed')).toBeTruthy();
    expect(screen.getByText(i18n.t('create_tournament.confirm.final_notice'))).toBeTruthy();
    await user.click(screen.getByRole('button', { name: i18n.t('create_tournament.action.finalize') }));
    expect(view.props.onConfirmCreate).toHaveBeenCalledTimes(1);
    expect(view.getDraft()).toEqual(draft);
  });
});
