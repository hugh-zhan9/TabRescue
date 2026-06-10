import { describe, it, expect, jest } from '@jest/globals';
import { SnapshotService } from '../src/services/SnapshotService';

describe('SnapshotService', () => {
  it('should not create a snapshot when current session is missing', async () => {
    const repository = {
      saveSnapshot: jest.fn(),
      getSettings: jest.fn(),
      getSnapshots: jest.fn(),
      deleteSnapshot: jest.fn(),
    } as any;
    const sessionSource = {
      fullCapture: jest.fn().mockResolvedValue(null),
      getCurrentSession: jest.fn().mockReturnValue(null),
    };

    const service = new SnapshotService(repository, sessionSource);

    await expect(service.createSnapshot()).rejects.toThrow('No current session to snapshot');
    expect(repository.saveSnapshot).not.toHaveBeenCalled();
  });

  it('should not create a snapshot when there are no restorable tabs', async () => {
    const repository = {
      saveSnapshot: jest.fn(),
      getSettings: jest.fn(),
      getSnapshots: jest.fn(),
      deleteSnapshot: jest.fn(),
    } as any;
    const sessionSource = {
      fullCapture: jest.fn().mockResolvedValue(null),
      getCurrentSession: jest.fn().mockReturnValue({
        id: 'singleton',
        updatedAt: Date.now(),
        windows: [{ windowId: '1', windowType: 'normal', isFocused: true, snapIndex: 0 }],
        tabs: [
          {
            url: 'https://example.com',
            windowId: '1',
            tabIndex: 0,
            isPinned: false,
            deletedAt: Date.now(),
          },
        ],
      }),
    };

    const service = new SnapshotService(repository, sessionSource);

    await expect(service.createSnapshot()).rejects.toThrow('No active tabs to snapshot');
    expect(repository.saveSnapshot).not.toHaveBeenCalled();
  });

  it('should refresh the in-memory session before saving when requested', async () => {
    const repository = {
      saveSnapshot: jest.fn().mockResolvedValue(undefined),
      getSettings: jest.fn().mockResolvedValue({ snapshot: { maxSnapshots: 5, retentionHours: 24 } }),
      getSnapshots: jest.fn().mockResolvedValue([]),
      deleteSnapshot: jest.fn(),
    } as any;
    const session = {
      id: 'singleton',
      updatedAt: Date.now(),
      windows: [{ windowId: '1', windowType: 'normal', isFocused: true, snapIndex: 0 }],
      tabs: [
        {
          url: 'https://example.com',
          windowId: '1',
          tabIndex: 0,
          isPinned: false,
          openedAt: Date.now(),
          updatedAt: Date.now(),
          deletedAt: null,
        },
      ],
    };
    const sessionSource = {
      fullCapture: jest.fn().mockResolvedValue(session),
      getCurrentSession: jest.fn().mockReturnValue(session),
    };

    const service = new SnapshotService(repository, sessionSource);
    await service.createSnapshot({ refreshCurrentState: true });

    expect(sessionSource.fullCapture).toHaveBeenCalledTimes(1);
    expect(repository.saveSnapshot).toHaveBeenCalledTimes(1);
  });

  it('should skip scheduled snapshot saves when the pages have not changed', async () => {
    const now = 1_800_000_000_000;
    jest.spyOn(Date, 'now').mockReturnValue(now);

    const latestSnapshot = {
      id: 'snapshot-latest',
      createdAt: now - 60_000,
      windowCount: 1,
      tabCount: 1,
      summary: { createdAt: now - 60_000, windows: [] },
    };
    const latestDetail = {
      ...latestSnapshot,
      windows: [{ windowId: 'previous-window', windowType: 'normal', isFocused: true, snapIndex: 0 }],
      tabs: [
        {
          url: 'https://example.com',
          windowId: 'previous-window',
          tabIndex: 0,
          isPinned: false,
          openedAt: now - 60_000,
          updatedAt: now - 60_000,
          deletedAt: null,
        },
      ],
    };
    const repository = {
      saveSnapshot: jest.fn().mockResolvedValue(undefined),
      getSettings: jest.fn().mockResolvedValue({ snapshot: { maxSnapshots: 5, retentionHours: 24 } }),
      getSnapshots: jest.fn().mockResolvedValue([latestSnapshot]),
      getSnapshotDetail: jest.fn().mockResolvedValue(latestDetail),
      deleteSnapshot: jest.fn(),
    } as any;
    const session = {
      id: 'singleton',
      updatedAt: now,
      windows: [{ windowId: 'current-window', windowType: 'normal', isFocused: true, snapIndex: 0 }],
      tabs: [
        {
          url: 'https://example.com',
          windowId: 'current-window',
          tabIndex: 0,
          isPinned: false,
          openedAt: now,
          updatedAt: now,
          deletedAt: null,
        },
      ],
    };
    const sessionSource = {
      fullCapture: jest.fn().mockResolvedValue(session),
      getCurrentSession: jest.fn().mockReturnValue(session),
    };

    const service = new SnapshotService(repository, sessionSource);
    const result = await service.createSnapshot({ refreshCurrentState: true, skipIfUnchanged: true });

    expect(result).toBe(latestSnapshot);
    expect(repository.saveSnapshot).not.toHaveBeenCalled();
    expect(repository.getSnapshotDetail).toHaveBeenCalledWith('snapshot-latest');

    jest.restoreAllMocks();
  });

  it('should delete snapshots older than the retention window', async () => {
    const now = 1_800_000_000_000;
    jest.spyOn(Date, 'now').mockReturnValue(now);
    const repository = {
      saveSnapshot: jest.fn(),
      getSettings: jest.fn().mockResolvedValue({ snapshot: { retentionHours: 24 } }),
      getSnapshots: jest.fn().mockResolvedValue([
        { id: 'snapshot-new', createdAt: now - 60_000 },
        { id: 'snapshot-old-1', createdAt: now - 25 * 60 * 60 * 1000 },
        { id: 'snapshot-old-2', createdAt: now - 26 * 60 * 60 * 1000 },
      ]),
      deleteSnapshot: jest.fn().mockResolvedValue(undefined),
    } as any;
    const sessionSource = {
      fullCapture: jest.fn(),
      getCurrentSession: jest.fn(),
    };

    const service = new SnapshotService(repository, sessionSource);
    await service.enforceSnapshotRetention();

    expect(repository.deleteSnapshot).toHaveBeenCalledTimes(2);
    expect(repository.deleteSnapshot).toHaveBeenNthCalledWith(1, 'snapshot-old-1');
    expect(repository.deleteSnapshot).toHaveBeenNthCalledWith(2, 'snapshot-old-2');

    jest.restoreAllMocks();
  });
});
