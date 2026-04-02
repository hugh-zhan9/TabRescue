#!/usr/bin/env node
// 图标生成脚本 - 使用 canvas 或 sharp 生成 PNG 图标
// 开发时可以先用 SVG 代替，发布前再生成 PNG

const fs = require('fs');
const path = require('path');

const sizes = [16, 48, 128];
const iconsDir = path.join(__dirname, 'public', 'icons');

console.log('图标生成脚本 - 请用真实 PNG 图标替换占位文件');
console.log('可以使用以下工具生成:');
console.log('1. 手动设计 PNG 图标');
console.log('2. 使用 sharp: npm install sharp');
console.log('3. 使用在线 SVG to PNG 转换器');
console.log('');

// 创建占位文本文件
sizes.forEach(size => {
  const filePath = path.join(iconsDir, `icon${size}.png`);
  console.log(`需要生成：icon${size}.png (${size}x${size})`);
});
