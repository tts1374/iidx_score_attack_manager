import { beforeAll, beforeEach } from 'vitest';

import { ensureI18n } from '../i18n';

beforeAll(async () => {
  await ensureI18n('ja');
});

beforeEach(async () => {
  await ensureI18n('ja');
});