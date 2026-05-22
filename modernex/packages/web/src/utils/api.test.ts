// ══════════════════════════════════════════════════════
// API Client Tests
// ══════════════════════════════════════════════════════

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { api, ApiError } from './api';

global.fetch = vi.fn();

describe('ApiClient', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset fetch mock
    vi.mocked(fetch).mockReset();
  });

  describe('GET requests', () => {
    it('should make successful GET request', async () => {
      const mockData = { id: 1, name: 'Test' };
      vi.mocked(fetch).mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => mockData,
      } as unknown as Response);

      const result = await api.get('/test');
      expect(result).toEqual(mockData);
      expect(fetch).toHaveBeenCalledWith(
        '/api/test',
        expect.objectContaining({
          method: 'GET',
          credentials: 'include',
        })
      );
    });

    it('should include query parameters', async () => {
      vi.mocked(fetch).mockResolvedValue({
        ok: true,
        json: async () => ({}),
      } as unknown as Response);

      await api.get('/products', { params: { variety: 'Black Galaxy', status: 'available' } });

      expect(fetch).toHaveBeenCalledWith(
        '/api/products?variety=Black+Galaxy&status=available',
        expect.any(Object)
      );
    });

    it('should filter out undefined params', async () => {
      vi.mocked(fetch).mockResolvedValue({
        ok: true,
        json: async () => ({}),
      } as unknown as Response);

      await api.get('/products', { params: { variety: 'Test', status: undefined } });

      const callUrl = vi.mocked(fetch).mock.calls[0]?.[0] as string;
      expect(callUrl).toContain('variety=Test');
      expect(callUrl).not.toContain('status');
    });
  });

  describe('POST requests', () => {
    it('should make successful POST request', async () => {
      const postData = { name: 'New Item' };
      const mockResponse = { id: 1, ...postData };

      vi.mocked(fetch).mockResolvedValue({
        ok: true,
        json: async () => mockResponse,
      } as unknown as Response);

      const result = await api.post('/items', postData);
      expect(result).toEqual(mockResponse);
      expect(fetch).toHaveBeenCalledWith(
        '/api/items',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify(postData),
        })
      );
    });

    it('should handle POST without body', async () => {
      vi.mocked(fetch).mockResolvedValue({
        ok: true,
        json: async () => ({}),
      } as unknown as Response);

      await api.post('/logout');

      expect(fetch).toHaveBeenCalledWith(
        '/api/logout',
        expect.objectContaining({
          method: 'POST',
          body: undefined,
        })
      );
    });
  });

  describe('PUT requests', () => {
    it('should make successful PUT request', async () => {
      const updateData = { name: 'Updated' };
      vi.mocked(fetch).mockResolvedValue({
        ok: true,
        json: async () => updateData,
      } as unknown as Response);

      const result = await api.put('/items/1', updateData);
      expect(result).toEqual(updateData);
      expect(fetch).toHaveBeenCalledWith(
        '/api/items/1',
        expect.objectContaining({
          method: 'PUT',
          body: JSON.stringify(updateData),
        })
      );
    });
  });

  describe('PATCH requests', () => {
    it('should make successful PATCH request', async () => {
      const patchData = { status: 'active' };
      vi.mocked(fetch).mockResolvedValue({
        ok: true,
        json: async () => patchData,
      } as unknown as Response);

      const result = await api.patch('/items/1', patchData);
      expect(result).toEqual(patchData);
    });
  });

  describe('DELETE requests', () => {
    it('should make successful DELETE request', async () => {
      vi.mocked(fetch).mockResolvedValue({
        ok: true,
        status: 204,
      } as unknown as Response);

      const result = await api.delete('/items/1');
      expect(result).toEqual({});
    });
  });

  describe('Error handling', () => {
    it('should throw ApiError on 404', async () => {
      vi.mocked(fetch).mockResolvedValue({
        ok: false,
        status: 404,
        statusText: 'Not Found',
        json: async () => ({ error: 'Item not found' }),
      } as unknown as Response);

      await expect(api.get('/items/999')).rejects.toThrow(ApiError);
      await expect(api.get('/items/999')).rejects.toThrow('Item not found');
    });

    it('should throw ApiError on 500', async () => {
      vi.mocked(fetch).mockResolvedValue({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
        json: async () => ({ error: 'Server error' }),
      } as unknown as Response);

      await expect(api.get('/items')).rejects.toThrow('Server error');
    });

    it('should handle non-JSON error responses', async () => {
      vi.mocked(fetch).mockResolvedValue({
        ok: false,
        status: 400,
        statusText: 'Bad Request',
        json: async () => {
          throw new Error('Not JSON');
        },
      } as unknown as Response);

      await expect(api.get('/items')).rejects.toThrow('HTTP 400: Bad Request');
    });

    it('should handle network errors', async () => {
      vi.mocked(fetch).mockRejectedValue(new Error('Network error'));

      await expect(api.get('/items')).rejects.toThrow('Network error');
    });

    it('should include status in ApiError', async () => {
      vi.mocked(fetch).mockResolvedValue({
        ok: false,
        status: 403,
        statusText: 'Forbidden',
        json: async () => ({ error: 'Access denied' }),
      } as unknown as Response);

      try {
        await api.get('/admin');
      } catch (err) {
        expect(err).toBeInstanceOf(ApiError);
        expect((err as ApiError).status).toBe(403);
        expect((err as ApiError).message).toBe('Access denied');
      }
    });
  });

  describe('File upload', () => {
    it('should upload FormData', async () => {
      const formData = new FormData();
      formData.append('file', new Blob(['test']), 'test.txt');

      vi.mocked(fetch).mockResolvedValue({
        ok: true,
        json: async () => ({ success: true }),
      } as unknown as Response);

      await api.upload('/upload', formData);

      expect(fetch).toHaveBeenCalledWith(
        '/api/upload',
        expect.objectContaining({
          method: 'POST',
          body: formData,
        })
      );

      // Should not set Content-Type header (browser sets it with boundary)
      const callArgs = vi.mocked(fetch).mock.calls[0]?.[1];
      // FormData lets browser set Content-Type with boundary
      expect(callArgs?.body).toBeInstanceOf(FormData);
    });
  });

  describe('Headers', () => {
    it('should include default headers', async () => {
      vi.mocked(fetch).mockResolvedValue({
        ok: true,
        json: async () => ({}),
      } as unknown as Response);

      await api.get('/test');

      const callArgs = vi.mocked(fetch).mock.calls[0]?.[1];
      expect(callArgs?.headers).toMatchObject({
        'Content-Type': 'application/json',
      });
    });

    it('should include credentials', async () => {
      vi.mocked(fetch).mockResolvedValue({
        ok: true,
        json: async () => ({}),
      } as unknown as Response);

      await api.get('/test');

      const callArgs = vi.mocked(fetch).mock.calls[0]?.[1];
      expect(callArgs?.credentials).toBe('include');
    });
  });
});
