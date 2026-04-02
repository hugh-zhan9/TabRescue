import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { RecoveryService } from '../src/services/RecoveryService';

describe('RecoveryService', () => {
  beforeEach(() => {
    global.chrome = {
      windows: {
        getAll: jest.fn().mockResolvedValue([]),
        create: jest.fn().mockResolvedValue({ id: 100, tabs: [{ id: 200 }] }),
        remove: jest.fn().mockResolvedValue(undefined),
      },
      tabs: {
        create: jest.fn().mockResolvedValue({}),
        update: jest.fn().mockResolvedValue({}),
      },
    } as any;
  });

  it('should skip non-restorable urls and continue restoring valid tabs', async () => {
    const repository = {
      getSnapshotDetail: jest.fn().mockResolvedValue({
        id: 'snapshot-1',
        createdAt: Date.now(),
        windowCount: 1,
        tabCount: 3,
        summary: { createdAt: Date.now(), windows: [] },
        windows: [{ windowId: '1', windowType: 'normal', isFocused: true, snapIndex: 0 }],
        tabs: [
          { url: 'chrome://settings', windowId: '1', tabIndex: 0, isPinned: false },
          { url: 'https://example.com', windowId: '1', tabIndex: 1, isPinned: false },
          { url: 'about:blank', windowId: '1', tabIndex: 2, isPinned: false },
        ],
      }),
    } as any;

    const service = new RecoveryService(repository);
    const result = await service.restoreSnapshot('snapshot-1');

    expect(chrome.windows.create).toHaveBeenCalledWith({
      type: 'normal',
      focused: false,
      url: 'https://example.com',
    });
    expect(result.tabsCreated).toBe(1);
    expect(result.failedTabs).toEqual([
      { url: 'chrome://settings', reason: 'URL is not restorable' },
      { url: 'about:blank', reason: 'URL is not restorable' },
    ]);
  });
});
