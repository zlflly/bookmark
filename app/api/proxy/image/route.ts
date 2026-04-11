import { NextRequest, NextResponse } from 'next/server'
export const runtime = 'nodejs'

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const imageUrl = searchParams.get('url')

  if (!imageUrl) {
    return NextResponse.json(
      { error: 'URL parameter is required' },
      { status: 400 }
    )
  }

  try {
    // Validate URL
    new URL(imageUrl)
  } catch {
    return NextResponse.json(
      { error: 'Invalid URL format' },
      { status: 400 }
    )
  }

  try {
    const response = await fetch(imageUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'image/*,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
        'Referer': new URL(imageUrl).origin,
      },
      signal: AbortSignal.timeout(15000) // 15 second timeout
    })

    if (!response.ok) {
      console.error(`Failed to fetch image: ${response.status} ${response.statusText}`)
      
      // For 404 or other client errors, return a transparent pixel instead of failing
      if (response.status === 404 || response.status >= 400) {
        // Return a 1x1 transparent PNG
        const transparentPng = Buffer.from(
          'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChAI9jU77yQAAAABJRU5ErkJggg==',
          'base64'
        )
        
        return new Response(transparentPng, {
          headers: {
            'Content-Type': 'image/png',
            'Cache-Control': 'public, max-age=3600',
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET',
            'Access-Control-Allow-Headers': 'Content-Type',
          },
        })
      }
      
      throw new Error(`HTTP ${response.status}: ${response.statusText}`)
    }

    const contentType = response.headers.get('content-type')
    
    // Be more lenient with content type checking
    if (contentType && !contentType.startsWith('image/') && !contentType.includes('octet-stream')) {
      console.error(`Invalid content type: ${contentType}`)
      throw new Error('Response is not an image')
    }

    // Stream the image data
    const imageBuffer = await response.arrayBuffer()

    return new Response(imageBuffer, {
      headers: {
        'Content-Type': contentType || 'image/jpeg',
        'Cache-Control': 'public, max-age=3600', // Cache for 1 hour
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET',
        'Access-Control-Allow-Headers': 'Content-Type',
      },
    })

  } catch (error) {
    console.error('Image proxy error:', error)
    
    // Return a transparent pixel instead of an error for better UX
    const transparentPng = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChAI9jU77yQAAAABJRU5ErkJggg==',
      'base64'
    )
    
    return new Response(transparentPng, {
      headers: {
        'Content-Type': 'image/png',
        'Cache-Control': 'public, max-age=300', // Cache for 5 minutes for errors
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET',
        'Access-Control-Allow-Headers': 'Content-Type',
      },
    })
  }
}