// 输入验证和XSS防护工具函数

/**
 * 清理HTML内容，防止XSS攻击
 * @param html 原始HTML内容
 * @returns 清理后的HTML内容
 */
export function sanitizeHtml(html: string): string {
  // 简单的HTML清理，移除危险标签和属性
  return html
    .replace(/<script[^>]*>.*?<\/script>/gi, '')
    .replace(/<iframe[^>]*>.*?<\/iframe>/gi, '')
    .replace(/on\w+\s*=\s*["'][^"']*["']/gi, '')
    .replace(/javascript:/gi, '')
}

/**
 * 验证电子邮件格式
 * @param email 电子邮件地址
 * @returns 是否为有效电子邮件
 */
export function validateEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  return emailRegex.test(email)
}

/**
 * 验证密码强度
 * @param password 密码
 * @returns 密码强度评估对象
 */
export function validatePassword(password: string): { valid: boolean; message: string } {
  if (password.length < 6) {
    return { valid: false, message: '密码长度至少为6位' }
  }
  if (!/[A-Z]/.test(password) || !/[a-z]/.test(password) || !/[0-9]/.test(password)) {
    return { valid: false, message: '密码必须包含大小写字母和数字' }
  }
  return { valid: true, message: '密码强度良好' }
}

/**
 * 验证用户名格式
 * @param username 用户名
 * @returns 是否为有效用户名
 */
export function validateUsername(username: string): boolean {
  // 用户名只能包含字母、数字、下划线，长度为3-20位
  const usernameRegex = /^[a-zA-Z0-9_]{3,20}$/
  return usernameRegex.test(username)
}

/**
 * 清理用户输入，防止XSS攻击
 * @param input 用户输入
 * @returns 清理后的输入
 */
export function sanitizeInput(input: string): string {
  return input
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}

/**
 * 验证URL格式
 * @param url URL地址
 * @returns 是否为有效URL
 */
export function validateUrl(url: string): boolean {
  try {
    new URL(url)
    return true
  } catch {
    return false
  }
}

/**
 * 验证文本长度
 * @param text 文本
 * @param min 最小长度
 * @param max 最大长度
 * @returns 是否在指定长度范围内
 */
export function validateLength(text: string, min: number, max: number): boolean {
  const length = text.trim().length
  return length >= min && length <= max
}
