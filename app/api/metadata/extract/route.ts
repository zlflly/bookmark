import { NextRequest, NextResponse } from 'next/server'
export const runtime = 'nodejs'

// 真正的链接元数据提取函数
async function extractMetadata(url: string) {
  try {
    const domain = new URL(url).hostname
    
    // 获取网页内容
    const headers: Record<string, string> = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    }
    
    // 对于Twitter/X，添加特殊的请求头
    if (domain.includes('twitter.com') || domain.includes('x.com')) {
      headers['Accept'] = 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8'
      headers['Accept-Language'] = 'en-US,en;q=0.5'
      headers['Accept-Encoding'] = 'gzip, deflate, br'
      headers['DNT'] = '1'
      headers['Connection'] = 'keep-alive'
      headers['Upgrade-Insecure-Requests'] = '1'
    }
    
    // 对于itch.io，添加更好的兼容性头部
    if (domain.includes('itch.io')) {
      headers['Accept'] = 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8'
      headers['Accept-Language'] = 'en-US,en;q=0.5'
      headers['Accept-Encoding'] = 'gzip, deflate, br'
      headers['Cache-Control'] = 'no-cache'
    }
    
    const response = await fetch(url, {
      headers,
      // 设置超时
      signal: AbortSignal.timeout(15000) // 15秒超时，给itch.io等复杂页面更多时间
    })
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`)
    }
    
    const html = await response.text()
    
    // 解析 HTML 提取元数据
    const metadata = {
      title: extractTitle(html, domain),
      description: extractDescription(html, url),
      image: extractImage(html, url),
      favicon: extractFavicon(html, url),
      domain
    }
    
    return metadata
  } catch (error) {
    console.error('提取元数据失败:', error)
    
    // 如果提取失败，返回增强的基本信息
    const domain = new URL(url).hostname
    let fallbackTitle = `来自 ${domain} 的内容`
    let fallbackDescription = "无法获取详细描述信息"
    
    // 为特定网站提供更好的回退信息
    if (domain.includes('itch.io')) {
      fallbackTitle = "itch.io 独立游戏"
      fallbackDescription = "来自 itch.io 的独立游戏作品"
    } else if (domain.includes('bilibili.com')) {
      fallbackTitle = "哔哩哔哩视频"
      fallbackDescription = "来自哔哩哔哩的视频内容"
    } else if (domain.includes('twitter.com') || domain.includes('x.com')) {
      fallbackTitle = "X (Twitter) 推文"
      fallbackDescription = "来自 X 的推文内容"
    } else if (domain.includes('github.com')) {
      fallbackTitle = "GitHub 项目"
      fallbackDescription = "来自 GitHub 的开源项目"
    }
    
    return {
      title: fallbackTitle,
      description: fallbackDescription,
      image: null,
      favicon: `https://${domain}/favicon.ico`,
      domain
    }
  }
}

// 提取标题
function extractTitle(html: string, domain: string): string {
  // X(Twitter)特殊处理
  if (domain.includes('twitter.com') || domain.includes('x.com')) {
    return extractTwitterTitle(html, domain)
  }
  
  // itch.io特殊处理
  if (domain.includes('itch.io')) {
    return extractItchIoTitle(html, domain)
  }
  
  // 尝试提取 title 标签
  const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i)
  if (titleMatch) {
    return titleMatch[1].trim()
  }
  
  // 尝试提取 og:title
  const ogTitleMatch = html.match(/<meta[^>]*property=["']og:title["'][^>]*content=["']([^"']+)["']/i)
  if (ogTitleMatch) {
    return ogTitleMatch[1].trim()
  }
  
  // 尝试提取 twitter:title
  const twitterTitleMatch = html.match(/<meta[^>]*name=["']twitter:title["'][^>]*content=["']([^"']+)["']/i)
  if (twitterTitleMatch) {
    return twitterTitleMatch[1].trim()
  }
  
  return `来自 ${domain} 的内容`
}

// 提取描述
function extractDescription(html: string, baseUrl?: string): string {
  // X(Twitter)特殊处理
  if (baseUrl) {
    const domain = new URL(baseUrl).hostname
    if (domain.includes('twitter.com') || domain.includes('x.com')) {
      return extractTwitterDescription(html)
    }
    
    // itch.io特殊处理
    if (domain.includes('itch.io')) {
      return extractItchIoDescription(html)
    }
  }
  
  // 尝试提取 meta description
  const descMatch = html.match(/<meta[^>]*name=["']description["'][^>]*content=["']([^"']+)["']/i)
  if (descMatch) {
    return descMatch[1].trim()
  }
  
  // 尝试提取 og:description
  const ogDescMatch = html.match(/<meta[^>]*property=["']og:description["'][^>]*content=["']([^"']+)["']/i)
  if (ogDescMatch) {
    return ogDescMatch[1].trim()
  }
  
  // 尝试提取 twitter:description
  const twitterDescMatch = html.match(/<meta[^>]*name=["']twitter:description["'][^>]*content=["']([^"']+)["']/i)
  if (twitterDescMatch) {
    return twitterDescMatch[1].trim()
  }
  
  return "暂无描述信息"
}

// 提取图片 - 增强版本
function extractImage(html: string, baseUrl: string): string | null {
  const domain = new URL(baseUrl).hostname

  // 哔哩哔哩视频封面特殊处理
  if (domain.includes('bilibili.com')) {
    return extractBilibiliCover(html, baseUrl)
  }

  // ArchDaily图片特殊处理
  if (domain.includes('archdaily.cn') || domain.includes('archdaily.com')) {
    return extractArchDailyFirstImage(html, baseUrl)
  }

  // X(Twitter)特殊处理
  if (domain.includes('twitter.com') || domain.includes('x.com')) {
    return extractTwitterImage(html, baseUrl)
  }

  // itch.io特殊处理
  if (domain.includes('itch.io')) {
    return extractItchIoImage(html, baseUrl)
  }

  // 通用图片提取策略（按优先级排序）
  const imagePatterns = [
    // Open Graph协议图片（最标准）
    /<meta[^>]*property=["']og:image["'][^>]*content=["']([^"']+)["']/i,
    /<meta[^>]*content=["']([^"']+)["'][^>]*property=["']og:image["']/i,

    // Twitter Card图片
    /<meta[^>]*name=["']twitter:image["'][^>]*content=["']([^"']+)["']/i,
    /<meta[^>]*content=["']([^"']+)["'][^>]*name=["']twitter:image["']/i,

    // Schema.org结构化数据（itemprop）
    /<meta[^>]*itemprop=["']image["'][^>]*content=["']([^"']+)["']/i,
    /<img[^>]*itemprop=["']image["'][^>]*src=["']([^"']+)["']/i,

    // Windows磁贴图片
    /<meta[^>]*name=["']msapplication-TileImage["'][^>]*content=["']([^"']+)["']/i,

    // Apple touch icon (备选高质量图片)
    /<link[^>]*rel=["']apple-touch-icon["'][^>]*href=["']([^"']+)["']/i,
  ]

  // 尝试从meta标签提取
  for (const pattern of imagePatterns) {
    const match = html.match(pattern)
    if (match && match[1]) {
      const imageUrl = resolveUrl(match[1], baseUrl)
      if (isValidImageUrl(imageUrl)) {
        return imageUrl
      }
    }
  }

  // 尝试从JSON-LD结构化数据提取
  const jsonLdImage = extractImageFromJsonLd(html, baseUrl)
  if (jsonLdImage && isValidImageUrl(jsonLdImage)) {
    return jsonLdImage
  }

  // 最后尝试：查找页面中第一张较大的图片（排除小图标）
  const firstLargeImage = extractFirstLargeImage(html, baseUrl)
  if (firstLargeImage && isValidImageUrl(firstLargeImage)) {
    return firstLargeImage
  }

  return null
}

// 从JSON-LD结构化数据中提取图片
function extractImageFromJsonLd(html: string, baseUrl: string): string | null {
  const jsonLdMatches = html.matchAll(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)

  for (const match of jsonLdMatches) {
    try {
      const jsonData = JSON.parse(match[1])

      // 处理单个对象
      const image = findImageInJsonLdObject(jsonData)
      if (image) {
        return resolveUrl(image, baseUrl)
      }

      // 处理数组
      if (Array.isArray(jsonData)) {
        for (const item of jsonData) {
          const image = findImageInJsonLdObject(item)
          if (image) {
            return resolveUrl(image, baseUrl)
          }
        }
      }
    } catch (e) {
      // 忽略JSON解析错误，继续尝试下一个
      continue
    }
  }

  return null
}

// 在JSON-LD对象中查找图片
function findImageInJsonLdObject(obj: any): string | null {
  if (!obj || typeof obj !== 'object') return null

  // 直接的image属性
  if (obj.image) {
    if (typeof obj.image === 'string') {
      return obj.image
    }
    // image可能是对象
    if (obj.image.url) {
      return obj.image.url
    }
    // image可能是数组
    if (Array.isArray(obj.image) && obj.image.length > 0) {
      const firstImage = obj.image[0]
      return typeof firstImage === 'string' ? firstImage : firstImage.url
    }
  }

  // thumbnailUrl属性
  if (obj.thumbnailUrl) {
    return typeof obj.thumbnailUrl === 'string' ? obj.thumbnailUrl : obj.thumbnailUrl[0]
  }

  // logo属性（备选）
  if (obj.logo) {
    if (typeof obj.logo === 'string') {
      return obj.logo
    }
    if (obj.logo.url) {
      return obj.logo.url
    }
  }

  return null
}

// 提取页面中第一张较大的图片
function extractFirstLargeImage(html: string, baseUrl: string): string | null {
  // 查找带有尺寸属性的图片（宽度或高度至少200px）
  const imagePatternsWithSize = [
    /<img[^>]*src=["']([^"']+)["'][^>]*(?:width=["'](\d+)|height=["'](\d+))/gi,
    /<img[^>]*(?:width=["'](\d+)|height=["'](\d+))[^>]*src=["']([^"']+)["']/gi,
  ]

  for (const pattern of imagePatternsWithSize) {
    const matches = html.matchAll(pattern)
    for (const match of matches) {
      const src = match[1] || match[3]
      const width = parseInt(match[2] || match[1] || '0')
      const height = parseInt(match[3] || match[2] || '0')

      if (src && (width >= 200 || height >= 200)) {
        const imageUrl = resolveUrl(src, baseUrl)
        if (isValidImageUrl(imageUrl) && !isLikelyIcon(imageUrl)) {
          return imageUrl
        }
      }
    }
  }

  // 如果没有找到带尺寸的图片，找第一张看起来不是图标的图片
  const simpleImagePattern = /<img[^>]*src=["']([^"']+\.(?:jpg|jpeg|png|webp))["']/i
  const simpleMatch = html.match(simpleImagePattern)
  if (simpleMatch && simpleMatch[1]) {
    const imageUrl = resolveUrl(simpleMatch[1], baseUrl)
    if (isValidImageUrl(imageUrl) && !isLikelyIcon(imageUrl)) {
      return imageUrl
    }
  }

  return null
}

// 验证图片URL是否有效
function isValidImageUrl(url: string): boolean {
  if (!url || typeof url !== 'string') return false

  // 排除data URI
  if (url.startsWith('data:')) return false

  // 必须是http/https协议
  if (!url.startsWith('http://') && !url.startsWith('https://')) return false

  // 排除明显的占位符
  if (url.includes('placeholder') || url.includes('default-image')) return false

  // 检查是否是常见图片格式
  const imageExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg', '.bmp']
  const hasImageExtension = imageExtensions.some(ext => url.toLowerCase().includes(ext))

  // 如果URL中没有明确的图片扩展名，也可能是有效的（比如动态生成的图片）
  // 但至少要排除明显的非图片URL
  if (!hasImageExtension && url.includes('.js') || url.includes('.css')) {
    return false
  }

  return true
}

// 判断URL是否可能是图标
function isLikelyIcon(url: string): boolean {
  const iconKeywords = ['icon', 'logo', 'avatar', 'sprite', 'button', 'badge']
  const lowerUrl = url.toLowerCase()

  // 检查是否包含图标关键词
  if (iconKeywords.some(keyword => lowerUrl.includes(keyword))) {
    return true
  }

  // 检查尺寸（如果URL中包含尺寸信息）
  const sizeMatch = url.match(/(\d+)x(\d+)/)
  if (sizeMatch) {
    const size = parseInt(sizeMatch[1])
    if (size < 100) return true // 小于100px的可能是图标
  }

  return false
}

// 提取哔哩哔哩视频封面
function extractBilibiliCover(html: string, _baseUrl: string): string | null {
  // 优先从og:image meta标签提取（最可靠的方式）
  const ogImageMatch = html.match(/<meta[^>]*property=["']og:image["'][^>]*content=["']([^"']+)["']/i)
  if (ogImageMatch && ogImageMatch[1]) {
    let coverUrl = ogImageMatch[1].trim()
    
    // 处理协议缺失的情况：//i0.hdslb.com/... → https://i0.hdslb.com/...
    if (coverUrl.startsWith('//')) {
      coverUrl = 'https:' + coverUrl
    }
    
    // 移除B站URL中的尺寸参数，获取原图
    // 例如：.../cover.jpg@672w_378h_1c_!web-search-common-cover.jpg → .../cover.jpg
    coverUrl = coverUrl.replace(/@.*$/, '')
    
    return coverUrl
  }
  
  // 备选方案：从JSON-LD数据中提取封面
  const jsonLdMatch = html.match(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([^<]+)<\/script>/i)
  if (jsonLdMatch) {
    try {
      const jsonData = JSON.parse(jsonLdMatch[1])
      if (jsonData.thumbnailUrl) {
        let coverUrl = jsonData.thumbnailUrl
        if (coverUrl.startsWith('//')) {
          coverUrl = 'https:' + coverUrl
        }
        return coverUrl.replace(/@.*$/, '')
      }
    } catch (e) {
      console.log('解析JSON-LD失败:', e)
    }
  }
  
  // 备选方案：从window.__INITIAL_STATE__中提取
  const initialStateMatch = html.match(/window\.__INITIAL_STATE__\s*=\s*({[\s\S]+?});?\s*\(function/)
  if (initialStateMatch) {
    try {
      const stateData = JSON.parse(initialStateMatch[1])
      const picUrl = stateData?.videoData?.pic || stateData?.videoInfo?.pic
      if (picUrl) {
        let coverUrl = picUrl
        if (coverUrl.startsWith('//')) {
          coverUrl = 'https:' + coverUrl
        }
        return coverUrl.replace(/@.*$/, '')
      }
    } catch (e) {
      console.log('解析INITIAL_STATE失败:', e)
    }
  }
  
  // 最后备选：其他meta标签
  const otherPatterns = [
    /<meta[^>]*name=["']twitter:image["'][^>]*content=["']([^"']+)["']/i,
    /<meta[^>]*itemprop=["']image["'][^>]*content=["']([^"']+)["']/i
  ]
  
  for (const pattern of otherPatterns) {
    const match = html.match(pattern)
    if (match && match[1]) {
      let coverUrl = match[1]
      if (coverUrl.startsWith('//')) {
        coverUrl = 'https:' + coverUrl
      }
      return coverUrl.replace(/@.*$/, '')
    }
  }
  
  return null
}

// 提取ArchDaily第一张图片
function extractArchDailyFirstImage(html: string, baseUrl: string): string | null {
  // 优先尝试提取文章主要图片
  const imagePatterns = [
    // ArchDaily的主要图片通常在特定的容器中
    /<img[^>]*class=["'][^"']*main-image[^"']*["'][^>]*src=["']([^"']+)["']/i,
    /<img[^>]*class=["'][^"']*hero[^"']*["'][^>]*src=["']([^"']+)["']/i,
    /<img[^>]*class=["'][^"']*featured[^"']*["'][^>]*src=["']([^"']+)["']/i,
    // JSON-LD中的图片
    /"image"\s*:\s*"([^"]+)"/i,
    /"image"\s*:\s*\[\s*"([^"]+)"/i,
    // 文章内容区域的第一张图片
    /<article[^>]*>[\s\S]*?<img[^>]*src=["']([^"']+)["']/i,
    /<div[^>]*class=["'][^"']*content[^"']*["'][^>]*>[\s\S]*?<img[^>]*src=["']([^"']+)["']/i,
    // 通用的第一张图片（排除小图标和装饰性图片）
    /<img[^>]*src=["']([^"']+\.(?:jpg|jpeg|png|webp)[^"']*)["'][^>]*(?:width=["']\d{3,}|height=["']\d{3,})/i
  ]
  
  for (const pattern of imagePatterns) {
    const match = html.match(pattern)
    if (match && match[1]) {
      const imageUrl = resolveUrl(match[1], baseUrl)
      // 过滤掉明显的装饰性图片和图标
      if (!imageUrl.includes('icon') && 
          !imageUrl.includes('logo') && 
          !imageUrl.includes('avatar') &&
          !imageUrl.includes('placeholder')) {
        return imageUrl
      }
    }
  }
  
  // 如果以上都没找到，尝试og:image作为备选
  const ogImageMatch = html.match(/<meta[^>]*property=["']og:image["'][^>]*content=["']([^"']+)["']/i)
  if (ogImageMatch) {
    return resolveUrl(ogImageMatch[1], baseUrl)
  }
  
  return null
}

// 提取X(Twitter)图片和头像
function extractTwitterImage(html: string, baseUrl: string): string | null {
  // 优先提取推文中的图片（非头像）
  const mediaPatterns = [
    // 推文中的媒体图片（从示例HTML结构看）
    /<img[^>]*src=["']([^"']*pbs\.twimg\.com\/media[^"']+)["']/i,
    // 推文图片的常见class
    /<img[^>]*class=["'][^"']*media[^"']*["'][^>]*src=["']([^"']+)["']/i,
    // Twitter Card中的图片
    /<meta[^>]*name=["']twitter:image["'][^>]*content=["']([^"']+)["']/i,
    /<meta[^>]*property=["']og:image["'][^>]*content=["']([^"']+)["']/i,
    // 其他可能的推文图片
    /<img[^>]*src=["']([^"']*twimg\.com\/[^"']*(?:jpg|jpeg|png|webp|gif)[^"']*)["']/i
  ]
  
  // 首先寻找推文媒体图片
  for (const pattern of mediaPatterns) {
    const match = html.match(pattern)
    if (match && match[1]) {
      const imageUrl = resolveUrl(match[1], baseUrl)
      // 确保这不是头像
      if (!imageUrl.includes('profile_images') && 
          (imageUrl.includes('media') || imageUrl.includes('twimg.com'))) {
        return imageUrl
      }
    }
  }
  
  // 如果没有找到推文图片，再考虑用户头像
  const avatarPatterns = [
    /<img[^>]*src=["']([^"']*pbs\.twimg\.com\/profile_images[^"']+)["']/i,
    /<img[^>]*class=["'][^"']*profile[^"']*["'][^>]*src=["']([^"']+)["']/i,
    /<img[^>]*class=["'][^"']*avatar[^"']*["'][^>]*src=["']([^"']+)["']/i
  ]
  
  for (const pattern of avatarPatterns) {
    const match = html.match(pattern)
    if (match && match[1]) {
      const imageUrl = resolveUrl(match[1], baseUrl)
      if (imageUrl.includes('profile_images') || imageUrl.includes('pbs.twimg.com')) {
        return imageUrl
      }
    }
  }
  
  return null
}

// 提取X(Twitter)标题
function extractTwitterTitle(html: string, domain: string): string {
  // 尝试组合用户名和推文内容作为标题
  let username = ''
  let tweetContent = ''
  
  // 提取用户名
  const usernamePatterns = [
    // 从 og:title 中提取用户名（通常格式为 "用户名 on X: 推文内容"）
    /<meta[^>]*property=["']og:title["'][^>]*content=["']([^"']*?)\s+on\s+(X|Twitter):/i,
    // 从 title 标签提取用户名
    /<title[^>]*>([^"']*?)\s+on\s+(X|Twitter)[^<]*<\/title>/i,
    // 备选：从页面结构中提取
    /<span[^>]*class=["'][^"']*username[^"']*["'][^>]*>@?([^<]+)</i
  ]
  
  for (const pattern of usernamePatterns) {
    const match = html.match(pattern)
    if (match && match[1]) {
      username = match[1].trim().replace(/^@/, '')
      break
    }
  }
  
  // 提取推文内容
  const contentPatterns = [
    // 从 meta description 提取推文内容
    /<meta[^>]*name=["']description["'][^>]*content=["']([^"']+)["']/i,
    // 从 og:description 提取
    /<meta[^>]*property=["']og:description["'][^>]*content=["']([^"']+)["']/i,
    // 从 og:title 中提取推文内容部分
    /<meta[^>]*property=["']og:title["'][^>]*content=["'][^"']*?\s+on\s+(X|Twitter):\s*["']?([^"']+)["']?/i
  ]
  
  for (const pattern of contentPatterns) {
    const match = html.match(pattern)
    if (match) {
      // 对于第三个模式，推文内容在match[2]中
      tweetContent = (match[2] || match[1]).trim()
      break
    }
  }
  
  // 组合标题
  if (username && tweetContent) {
    // 如果推文内容太长，截取前100字符
    const shortContent = tweetContent.length > 100 ? tweetContent.substring(0, 100) + '...' : tweetContent
    return `@${username}: ${shortContent}`
  } else if (tweetContent) {
    return tweetContent.length > 120 ? tweetContent.substring(0, 120) + '...' : tweetContent
  } else if (username) {
    return `@${username} 的推文`
  }
  
  // 最后的备选方案
  const ogTitleMatch = html.match(/<meta[^>]*property=["']og:title["'][^>]*content=["']([^"']+)["']/i)
  if (ogTitleMatch) {
    let title = ogTitleMatch[1].trim()
    title = title.replace(/\s+on\s+(X|Twitter):\s*$|:\s*$/, '')
    return title
  }
  
  return `来自 ${domain} 的推文`
}

// 提取X(Twitter)描述
function extractTwitterDescription(html: string): string {
  // 尝试从 meta description 获取推文内容
  const descMatch = html.match(/<meta[^>]*name=["']description["'][^>]*content=["']([^"']+)["']/i)
  if (descMatch) {
    return descMatch[1].trim()
  }
  
  // 尝试从 og:description 获取
  const ogDescMatch = html.match(/<meta[^>]*property=["']og:description["'][^>]*content=["']([^"']+)["']/i)
  if (ogDescMatch) {
    return ogDescMatch[1].trim()
  }
  
  // 尝试从推文内容区域提取
  const tweetContentMatch = html.match(/<div[^>]*data-testid=["']tweetText["'][^>]*>([^<]+)</i)
  if (tweetContentMatch) {
    return tweetContentMatch[1].trim()
  }
  
  return "推文内容"
}

// 提取 favicon - 增强版本
function extractFavicon(html: string, baseUrl: string): string {
  const domain = new URL(baseUrl).origin

  // 尝试多种favicon格式，按优先级排序
  const faviconPatterns = [
    // 标准icon链接（支持多种rel值）
    /<link[^>]*rel=["'](?:icon|shortcut icon)["'][^>]*href=["']([^"']+)["']/i,
    /<link[^>]*href=["']([^"']+)["'][^>]*rel=["'](?:icon|shortcut icon)["']/i,

    // Apple touch icon（高质量移动设备图标）
    /<link[^>]*rel=["']apple-touch-icon["'][^>]*href=["']([^"']+)["']/i,
    /<link[^>]*href=["']([^"']+)["'][^>]*rel=["']apple-touch-icon["']/i,

    // Apple touch icon带尺寸
    /<link[^>]*rel=["']apple-touch-icon[^"']*["'][^>]*href=["']([^"']+)["']/i,

    // Windows磁贴图标
    /<meta[^>]*name=["']msapplication-TileImage["'][^>]*content=["']([^"']+)["']/i,

    // 通用meta图标
    /<link[^>]*rel=["']icon["'][^>]*type=["']image\/[^"']+["'][^>]*href=["']([^"']+)["']/i,
  ]

  for (const pattern of faviconPatterns) {
    const match = html.match(pattern)
    if (match && match[1]) {
      const iconUrl = resolveUrl(match[1], baseUrl)
      // 验证URL不是数据URI或无效链接
      if (iconUrl && !iconUrl.startsWith('data:') && iconUrl.startsWith('http')) {
        return iconUrl
      }
    }
  }

  // 尝试常见的默认favicon路径
  const defaultPaths = [
    '/favicon.ico',
    '/favicon.png',
    '/favicon.svg',
    '/apple-touch-icon.png',
    '/apple-touch-icon-precomposed.png'
  ]

  // 返回第一个默认路径（通常是favicon.ico）
  return `${domain}${defaultPaths[0]}`
}

// itch.io 专门处理函数
function extractItchIoTitle(html: string, domain: string): string {
  // 从JSON-LD结构化数据提取游戏名称
  const jsonLdMatch = html.match(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/i)
  if (jsonLdMatch) {
    try {
      const jsonData = JSON.parse(jsonLdMatch[1])
      if (jsonData.name) {
        return jsonData.name.trim()
      }
    } catch (e) {
      console.log('解析itch.io JSON-LD失败:', e)
    }
  }
  
  // 从页面标题提取游戏名称（去掉" by [开发者名] - itch.io"后缀）
  const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i)
  if (titleMatch) {
    let title = titleMatch[1].trim()
    // 移除 " by [developer] - itch.io" 后缀
    title = title.replace(/\s+by\s+[^-]+-\s*itch\.io\s*$/i, '')
    return title
  }
  
  // 尝试从页面结构中提取游戏标题
  const gameTitleMatch = html.match(/<h1[^>]*class=["'][^"']*game_title[^"']*["'][^>]*>([^<]+)</i) ||
                         html.match(/<h1[^>]*>([^<]+)<\/h1>/i)
  if (gameTitleMatch) {
    return gameTitleMatch[1].trim()
  }
  
  // 尝试从og:title提取
  const ogTitleMatch = html.match(/<meta[^>]*property=["']og:title["'][^>]*content=["']([^"']+)["']/i)
  if (ogTitleMatch) {
    let title = ogTitleMatch[1].trim()
    title = title.replace(/\s+by\s+[^-]+-\s*itch\.io\s*$/i, '')
    return title
  }
  
  return `来自 ${domain} 的游戏`
}

function extractItchIoDescription(html: string): string {
  // 从JSON-LD结构化数据提取描述
  const jsonLdMatch = html.match(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/i)
  if (jsonLdMatch) {
    try {
      const jsonData = JSON.parse(jsonLdMatch[1])
      if (jsonData.description) {
        let description = jsonData.description.trim()
        // 如果描述有评分信息，尝试增强描述
        if (jsonData.aggregateRating) {
          const rating = jsonData.aggregateRating.ratingValue
          const count = jsonData.aggregateRating.ratingCount
          description += ` (评分: ${rating}/5，${count}个评价)`
        }
        return description
      }
    } catch (e) {
      console.log('解析itch.io JSON-LD描述失败:', e)
    }
  }
  
  // 从游戏描述区域提取
  const gameDescMatch = html.match(/<div[^>]*class=["'][^"']*formatted_description[^"']*["'][^>]*>([\s\S]*?)<\/div>/i) ||
                        html.match(/<div[^>]*class=["'][^"']*game_description[^"']*["'][^>]*>([\s\S]*?)<\/div>/i)
  if (gameDescMatch) {
    // 清理HTML标签，保留文本内容
    let description = gameDescMatch[1].replace(/<[^>]*>/g, '').trim()
    // 限制描述长度
    if (description.length > 200) {
      description = description.substring(0, 200) + '...'
    }
    return description
  }
  
  // 尝试常规meta描述
  const metaDescMatch = html.match(/<meta[^>]*name=["']description["'][^>]*content=["']([^"']+)["']/i)
  if (metaDescMatch) {
    return metaDescMatch[1].trim()
  }
  
  // 尝试og:description
  const ogDescMatch = html.match(/<meta[^>]*property=["']og:description["'][^>]*content=["']([^"']+)["']/i)
  if (ogDescMatch) {
    return ogDescMatch[1].trim()
  }
  
  return "itch.io上的独立游戏"
}

function extractItchIoImage(html: string, baseUrl: string): string | null {
  // 优先提取游戏截图（但排除GIF格式）
  const screenshotPatterns = [
    // 只匹配非GIF的游戏截图
    /<img[^>]*src=["']([^"']*img\.itch\.zone[^"']*\.(?:jpg|jpeg|png|webp)[^"']*)["'][^>]*class=["'][^"']*screenshot[^"']*/i,
    /<img[^>]*class=["'][^"']*screenshot[^"']*["'][^>]*src=["']([^"']*img\.itch\.zone[^"']*\.(?:jpg|jpeg|png|webp)[^"']*)/i,
    // 游戏媒体图片 - 排除GIF
    /<img[^>]*src=["']([^"']*img\.itch\.zone[^"']*\.(?:jpg|jpeg|png|webp)[^"']*)["']/i,
    // 游戏封面
    /<img[^>]*class=["'][^"']*game_thumb[^"']*["'][^>]*src=["']([^"']+)["']/i,
    /<div[^>]*class=["'][^"']*game_thumb[^"']*["'][^>]*>[\s\S]*?<img[^>]*src=["']([^"']+)["']/i
  ]
  
  // 首先尝试找到非GIF的游戏截图
  for (const pattern of screenshotPatterns) {
    const match = html.match(pattern)
    if (match && match[1]) {
      let imageUrl = match[1]
      // 确认不是GIF格式
      if (!imageUrl.toLowerCase().includes('.gif')) {
        return resolveUrl(imageUrl, baseUrl)
      }
    }
  }
  
  // 如果只找到GIF截图，则查找开发者头像或其他静态图片
  const developerImagePatterns = [
    // 开发者头像
    /<img[^>]*class=["'][^"']*avatar[^"']*["'][^>]*src=["']([^"']*img\.itch\.zone[^"']*\.(?:jpg|jpeg|png|webp)[^"']*)/i,
    /<img[^>]*src=["']([^"']*img\.itch\.zone[^"']*\.(?:jpg|jpeg|png|webp)[^"']*)["'][^>]*class=["'][^"']*avatar[^"']*/i,
    // 开发者横幅
    /<img[^>]*class=["'][^"']*banner[^"']*["'][^>]*src=["']([^"']*img\.itch\.zone[^"']*\.(?:jpg|jpeg|png|webp)[^"']*)/i,
    // 用户头像（更通用的匹配）
    /<a[^>]*href=["'][^"']*\/[^"'\/]+["'][^>]*>[\s\S]*?<img[^>]*src=["']([^"']*img\.itch\.zone[^"']*\.(?:jpg|jpeg|png|webp)[^"']*)["']/i
  ]
  
  for (const pattern of developerImagePatterns) {
    const match = html.match(pattern)
    if (match && match[1]) {
      let imageUrl = match[1]
      return resolveUrl(imageUrl, baseUrl)
    }
  }
  
  // 备选：从JSON-LD结构化数据中提取图片
  const jsonLdMatch = html.match(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/i)
  if (jsonLdMatch) {
    try {
      const jsonData = JSON.parse(jsonLdMatch[1])
      if (jsonData.image) {
        const imageUrl = jsonData.image
        // 确认不是GIF格式
        if (!imageUrl.toLowerCase().includes('.gif')) {
          return resolveUrl(imageUrl, baseUrl)
        }
      }
    } catch (e) {
      console.log('解析itch.io JSON-LD图片失败:', e)
    }
  }
  
  // 尝试og:image作为备选（排除GIF）
  const ogImageMatch = html.match(/<meta[^>]*property=["']og:image["'][^>]*content=["']([^"']+)["']/i)
  if (ogImageMatch) {
    const imageUrl = ogImageMatch[1]
    if (!imageUrl.toLowerCase().includes('.gif')) {
      return resolveUrl(imageUrl, baseUrl)
    }
  }
  
  // 尝试twitter:image（排除GIF）
  const twitterImageMatch = html.match(/<meta[^>]*name=["']twitter:image["'][^>]*content=["']([^"']+)["']/i)
  if (twitterImageMatch) {
    const imageUrl = twitterImageMatch[1]
    if (!imageUrl.toLowerCase().includes('.gif')) {
      return resolveUrl(imageUrl, baseUrl)
    }
  }
  
  // 最后，如果实在找不到其他图片，再考虑使用任何可用的静态图片
  const fallbackPatterns = [
    // 任何itch.zone的非GIF图片
    /<img[^>]*src=["']([^"']*img\.itch\.zone[^"']*\.(?:jpg|jpeg|png|webp)[^"']*)["']/i
  ]
  
  for (const pattern of fallbackPatterns) {
    const match = html.match(pattern)
    if (match && match[1]) {
      return resolveUrl(match[1], baseUrl)
    }
  }
  
  return null
}

// 解析相对 URL
function resolveUrl(url: string, baseUrl: string): string {
  try {
    return new URL(url, baseUrl).href
  } catch {
    return url
  }
}

export async function POST(request: NextRequest) {
  try {
    const { url } = await request.json()
    
    if (!url) {
      return NextResponse.json(
        { success: false, error: { code: 'URL_REQUIRED', message: 'URL 参数必需' } },
        { status: 400 }
      )
    }

    // 验证 URL 格式
    try {
      new URL(url)
    } catch {
      return NextResponse.json(
        { success: false, error: { code: 'INVALID_URL', message: '无效的 URL 格式' } },
        { status: 400 }
      )
    }

    const metadata = await extractMetadata(url)

    return NextResponse.json({
      success: true,
      data: metadata
    })
  } catch (error) {
    console.error('提取元数据失败:', error)
    return NextResponse.json(
      { success: false, error: { code: 'EXTRACT_METADATA_ERROR', message: '提取元数据失败' } },
      { status: 500 }
    )
  }
}