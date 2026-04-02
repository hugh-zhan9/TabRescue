import { describe, it, expect } from '@jest/globals';
import { SqliteStorage } from '../src/storage/SqliteStorage.js';

describe.skip('SqliteStorage', () => {
  let storage: SqliteStorage;

  beforeEach(async () => {
    storage = new SqliteStorage(':memory:');
    await storage.initialize();
  });

  afterEach(() => {
    storage.close();
  });

  it('should save and get current session', async () => {
    const session = {
      id: 'singleton',
      updatedAt: Date.now(),
      windows: [
        { windowId: '1', windowType: 'normal', isFocused: true, snapIndex: 0 },
      ],
      tabs: [
        {
          url: 'https://example.com',
          windowId: '1',
          title: 'Example',
          tabIndex: 0,
          isPinned: false,
          openedAt: Date.now(),
          updatedAt: Date.now(),
          deletedAt: null,
        },
      ],
    };

    await storage.saveCurrentSession(session);
    const result = await storage.getCurrentSession();

    expect(result).toBeTruthy();
    expect(result?.windows.length).toBe(1);
    expect(result?.tabs.length).toBe(1);
  });

  it('should save and get snapshots', async () => {
    const snapshot = {
      id: 'snapshot-1',
      createdAt: Date.now(),
      windowCount: 1,
      tabCount: 2,
      summary: { windows: [] },
      windows: [
        { windowId: '1', windowType: 'normal', isFocused: true, snapIndex: 0 },
      ],
      tabs: [
        {
          url: 'https://example.com',
          windowId: '1',
          title: 'Example',
          tabIndex: 0,
          isPinned: false,
          openedAt: Date.now(),
          updatedAt: Date.now(),
        },
      ],
    };

    await storage.saveSnapshot(snapshot);
    const snapshots = await storage.getSnapshots(10);

    expect(snapshots.length).toBe(1);
    expect(snapshots[0].id).toBe('snapshot-1');
  });
});
