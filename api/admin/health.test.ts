import { expect, it } from 'vitest'
import { GET } from './health.js'

it('rejects unauthenticated admin requests before checking configuration', async () => {
  const response = await GET(new Request('https://example.com/api/admin/health'))
  expect(response.status).toBe(401)
  expect(response.headers.get('Cache-Control')).toBe('no-store')
})
