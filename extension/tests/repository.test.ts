import { describe, it, expect, jest } from '@jest/globals';

// Mock chrome.storage.local
const mockStorage = {
  local: {
    get: jest.fn(),
    set: jest.fn(),
  },
};

global.chrome = {
  storage: mockStorage,
} as any;

describe('Level1Repository', () => {
  let repository: any;

  beforeEach(async () => {
    const { Level1Repository } = await import('../src/repository/Level1Repository');
    repository = new Level1Repository();
    jest.clearAllMocks();
  });

  it('should save and get current session', async () => {
    const session = {
      id: 'singleton',
      updatedAt: Date.now(),
      windows: [],
      tabs: [],
    };

    mockStorage.local.set.mockResolvedValue(undefined);
    mockStorage.local.get.mockResolvedValue({ currentSession: session });

    await repository.saveCurrentSession(session);
    const result = await repository.getCurrentSession();

    expect(result).toEqual(session);
    expect(mockStorage.local.set).toHaveBeenCalledWith({ currentSession: session });
  });

  it('should return null when no session exists', async () => {
    mockStorage.local.get.mockResolvedValue({});

    const result = await repository.getCurrentSession();

    expect(result).toBeNull();
  });

  it('should save and get snapshots', async () => {
    const snapshots = [
      { id: '1', createdAt: 1000, windowCount: 1, tabCount: 5 },
      { id: '2', createdAt: 2000, windowCount: 2, tabCount: 10 },
    ];

    mockStorage.local.get.mockResolvedValue({ snapshots });

    const result = await repository.getSnapshots(10);

    expect(result.length).toBe(2);
  });
});
