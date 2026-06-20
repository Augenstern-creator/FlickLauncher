const { nativeImage } = require('electron');
const path = require('path');
const fs = require('fs');
const { exec } = require('child_process');

class IconExtractor {
  constructor(store) {
    this.store = store;
    this.cacheDir = path.join(require('electron').app.getPath('userData'), 'icon-cache');

    // 确保缓存目录存在
    if (!fs.existsSync(this.cacheDir)) {
      fs.mkdirSync(this.cacheDir, { recursive: true });
    }
  }

  /**
   * 从 .exe 文件提取图标
   * 在 Windows 上使用 PowerShell 提取图标
   * @param {string} exePath - .exe 文件路径
   * @returns {string|null} - 提取的图标文件路径，失败返回 null
   */
  async extractIcon(exePath) {
    if (!exePath || !exePath.toLowerCase().endsWith('.exe')) {
      return null;
    }

    try {
      // 生成缓存文件名
      const hash = this.hashPath(exePath);
      const cacheFile = path.join(this.cacheDir, `${hash}.png`);

      // 如果缓存已存在，直接返回
      if (fs.existsSync(cacheFile)) {
        return cacheFile;
      }

      // 只在 Windows 上尝试提取图标
      if (process.platform === 'win32') {
        return await this.extractWindowsIcon(exePath, cacheFile);
      }

      return null;
    } catch (e) {
      console.error('图标提取失败:', e.message);
      return null;
    }
  }

  /**
   * Windows 平台图标提取
   */
  async extractWindowsIcon(exePath, cacheFile) {
    try {
      // 使用 PowerShell 提取图标并保存为 PNG
      const psScript = `
Add-Type -AssemblyName System.Drawing
$icon = [System.Drawing.Icon]::ExtractAssociatedIcon("${exePath.replace(/"/g, '`"')}")
if ($icon) {
    $bitmap = $icon.ToBitmap()
    $bitmap.Save("${cacheFile.replace(/"/g, '`"')}", [System.Drawing.Imaging.ImageFormat]::Png)
    $bitmap.Dispose()
    $icon.Dispose()
    Write-Output "SUCCESS"
} else {
    Write-Output "FAILED"
}
`;

      const result = await new Promise((resolve, reject) => {
        exec(
          `powershell -NoProfile -Command "${psScript.replace(/\n/g, '; ')}"`,
          { timeout: 10000 },
          (err, stdout) => {
            if (err) reject(err);
            else resolve(stdout.trim());
          }
        );
      });

      if (result.includes('SUCCESS') && fs.existsSync(cacheFile)) {
        return cacheFile;
      }
    } catch (e) {
      console.error('Windows 图标提取失败:', e.message);
    }
    return null;
  }

  /**
   * 生成路径的简单哈希
   */
  hashPath(filePath) {
    let hash = 0;
    const normalized = filePath.toLowerCase().replace(/\\/g, '/');
    for (let i = 0; i < normalized.length; i++) {
      const char = normalized.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32bit integer
    }
    return Math.abs(hash).toString(36);
  }

  /**
   * 获取默认图标路径
   */
  getDefaultIcon() {
    return path.join(__dirname, '..', 'renderer', 'icons', 'default-icon.png');
  }

  /**
   * 获取图标路径（如果有自定义图标则使用自定义，否则尝试提取）
   */
  async getIconPath(shortcut) {
    // 如果有自定义图标且文件存在
    if (shortcut.icon && fs.existsSync(shortcut.icon)) {
      return shortcut.icon;
    }

    // 如果是 .exe 文件，尝试提取图标
    if (shortcut.path && shortcut.path.toLowerCase().endsWith('.exe')) {
      const extracted = await this.extractIcon(shortcut.path);
      if (extracted) {
        return extracted;
      }
    }

    // 返回默认图标
    return this.getDefaultIcon();
  }

  /**
   * 清理图标缓存
   */
  clearCache() {
    try {
      if (fs.existsSync(this.cacheDir)) {
        const files = fs.readdirSync(this.cacheDir);
        for (const file of files) {
          fs.unlinkSync(path.join(this.cacheDir, file));
        }
      }
    } catch (e) {
      console.error('清理缓存失败:', e.message);
    }
  }
}

module.exports = IconExtractor;
