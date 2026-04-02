import { describe, it, expect, jest } from '@jest/globals';
import { SnapshotService } from '../src/services/SnapshotService';

describe('SnapshotService', () => {
  it('should not create a snapshot when current session is missing', async () => {
    const repository = {
      getCurrentSession: jest.fn().mockResolvedValue(null),
      saveSnapshot: jest.fn(),
      getSettings: jest.fn(),
      getSnapshots: jest.fn(),
      deleteSnapshot: jest.fn(),
    } as any;

    const service = new SnapshotService(repository);

    await expect(service.createSnapshot()).rejects.toThrow('No current session to snapshot');
    expect(repository.saveSnapshot).not.toHaveBeenCalled();
  });

  it('should not create a snapshot when there are no restorable tabs', async () => {
    const repository = {
      getCurrentSession: jest.fn().mockResolvedValue({
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
      saveSnapshot: jest.fn(),
      getSettings: jest.fn(),
      getSnapshots: jest.fn(),
      deleteSnapshot: jest.fn(),
    } as any;

    const service = new SnapshotService(repository);

    await expect(service.createSnapshot()).rejects.toThrow('No active tabs to snapshot');
    expect(repository.saveSnapshot).not.toHaveBeenCalled();
  });
});
