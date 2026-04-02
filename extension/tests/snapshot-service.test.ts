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
      getSettings: jest.fn().mockResolvedValue({ snapshot: { maxSnapshots: 20 } }),
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

  it('should trim old snapshots immediately when enforcing the max limit', async () => {
    const repository = {
      saveSnapshot: jest.fn(),
      getSettings: jest.fn().mockResolvedValue({ snapshot: { maxSnapshots: 2 } }),
      getSnapshots: jest.fn().mockResolvedValue([
        { id: 'snapshot-4' },
        { id: 'snapshot-3' },
        { id: 'snapshot-2' },
        { id: 'snapshot-1' },
      ]),
      deleteSnapshot: jest.fn().mockResolvedValue(undefined),
    } as any;
    const sessionSource = {
      fullCapture: jest.fn(),
      getCurrentSession: jest.fn(),
    };

    const service = new SnapshotService(repository, sessionSource);
    await service.enforceSnapshotLimit();

    expect(repository.deleteSnapshot).toHaveBeenCalledTimes(2);
    expect(repository.deleteSnapshot).toHaveBeenNthCalledWith(1, 'snapshot-2');
    expect(repository.deleteSnapshot).toHaveBeenNthCalledWith(2, 'snapshot-1');
  });
});
