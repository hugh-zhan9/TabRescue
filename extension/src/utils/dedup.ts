import { TabData, DedupStrategy } from '../types';

/**
 * 根据去重策略查找标签页索引（只匹配未删除的标签）
 */
export function findTabIndexByKey(
  tabs: TabData[],
  url: string,
  windowId: string,
  strategy: DedupStrategy
): number {
  switch (strategy) {
    case 'strict':
      // 全局去重：只匹配 URL，且未删除
      return tabs.findIndex((t) => t.url === url && !t.deletedAt);
    case 'per-window':
      // 按窗口去重：匹配 URL + 窗口 ID，且未删除
      return tabs.findIndex((t) => t.url === url && t.windowId === windowId && !t.deletedAt);
    case 'none':
      // 完全不去重：永不匹配
      return -1;
  }
}

/**
 * 根据去重策略生成唯一键
 */
export function getDedupKey(
  url: string,
  windowId: string,
  strategy: DedupStrategy
): string {
  switch (strategy) {
    case 'strict':
      return url;
    case 'per-window':
      return `${windowId}::${url}`;
    case 'none':
      // 生成唯一键
      return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }
}
