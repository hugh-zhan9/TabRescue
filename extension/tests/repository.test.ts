import { describe, it, expect, beforeEach, jest } from '@jest/globals';

const mockStorage = {
  local: {
    get: jest.fn(),
    set: jest.fn(),
  },
};

describe('Level1Repository', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    global.chrome = {
      storage: mockStorage,
    } as any;
  });

  it('should return snapshots sorted by createdAt descending', async () => {
    mockStorage.local.get.mockResolvedValue({
      snapshots: [
        { id: '1', createdAt: 1000, windowCount: 1, tabCount: 1 },
        { id: '3', createdAt: 3000, windowCount: 1, tabCount: 3 },
        { id: '2', createdAt: 2000, windowCount: 1, tabCount: 2 },
      ],
    });

    const { Level1Repository } = await import('../src/repository/Level1Repository');
    const repository = new Level1Repository();
    const result = await repository.getSnapshots(2);

    expect(result.map((snapshot) => snapshot.id)).toEqual(['3', '2']);
  });

  it('should return popup state from local storage', async () => {
    mockStorage.local.get.mockResolvedValue({
      snapshots: [
        { id: '2', createdAt: 2000, windowCount: 1, tabCount: 2 },
      ],
      settings: {
        snapshot: { autoSaveInterval: 10, maxSnapshots: 5 },
      },
    });

    const { Level1Repository } = await import('../src/repository/Level1Repository');
    const repository = new Level1Repository();
    const result = await repository.getPopupState(20);

    expect(result.snapshots).toHaveLength(1);
    expect(result.settings.snapshot.autoSaveInterval).toBe(10);
  });
});

describe('NativeRepository', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    Object.defineProperty(global, 'navigator', {
      value: { userAgent: 'Chrome/123.0.0.0' },
      configurable: true,
    });
    global.chrome = {
      runtime: {
        sendNativeMessage: jest.fn(),
      },
      storage: mockStorage,
    } as any;
  });

  it('should merge defaults into popup state returned from native host', async () => {
    const sendNativeMessage = chrome.runtime.sendNativeMessage as jest.Mock;
    sendNativeMessage.mockImplementation((_host, _payload, callback) => {
      callback({
        success: true,
        data: {
          snapshots: [{ id: 'snapshot-1', createdAt: 1, windowCount: 1, tabCount: 1 }],
          settings: { snapshot: { autoSaveInterval: 15 } },
        },
      });
    });

    const { NativeRepository } = await import('../src/repository/NativeRepository');
    const repository = new NativeRepository(3);
    const result = await repository.getPopupState(10);

    expect(result.snapshots).toHaveLength(1);
    expect(result.settings.snapshot.autoSaveInterval).toBe(15);
    expect(result.settings.snapshot.maxSnapshots).toBe(20);
  });
});
