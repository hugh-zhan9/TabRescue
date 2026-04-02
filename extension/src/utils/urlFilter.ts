/**
 * URL 过滤工具
 * 判断标签页是否应该被采集
 */

const EXCLUDED_PREFIXES = [
  'chrome://',
  'about:',
  'edge://',
  'moz://',
  'chrome-extension://',
  'moz-extension://',
  'chrome-newtab://',
  'about:newtab',
  'about:blank',
  'data:',
  'javascript:',
  'ftp://',
  'view-source:',
];

const EXCLUDED_URL_PATTERNS = [
  /^chrome:\/\/newtab/,
  /^about:(newtab|blank)/,
];

/**
 * 检查 URL 是否应该被采集
 */
export function shouldCollectUrl(url: string | undefined): boolean {
  if (!url) return false;

  // 检查是否在排除前缀列表中
  for (const prefix of EXCLUDED_PREFIXES) {
    if (url.startsWith(prefix)) {
      return false;
    }
  }

  // 检查是否在排除模式中
  for (const pattern of EXCLUDED_URL_PATTERNS) {
    if (pattern.test(url)) {
      return false;
    }
  }

  return true;
}

/**
 * 检查标签页是否应该被采集
 */
export function shouldCollect(tab: chrome.tabs.Tab): boolean {
  // 排除隐私窗口
  if (tab.incognito) return false;

  // 检查 URL
  return shouldCollectUrl(tab.url);
}

/**
 * 检查 URL 是否是可恢复的（用于恢复时二次校验）
 */
export function isRestorableUrl(url: string | undefined): boolean {
  if (!url) return false;

  // 允许 http/https
  if (url.startsWith('http://') || url.startsWith('https://')) {
    return true;
  }

  // 允许 file:// (如果用户启用)
  if (url.startsWith('file://')) {
    return true;
  }

  return false;
}
