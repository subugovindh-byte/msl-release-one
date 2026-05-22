// ══════════════════════════════════════════════════════
// Modern API Client with TypeScript
// ══════════════════════════════════════════════════════


class ApiError extends Error {
  constructor(
    message: string,
    public status?: number,
    public data?: unknown
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

interface RequestConfig extends RequestInit {
  params?: Record<string, string | number | boolean | undefined>;
}

class ApiClient {
  private baseUrl: string;

  constructor(baseUrl = (import.meta.env.VITE_API_URL as string | undefined) ?? '/api') {
    this.baseUrl = baseUrl;
  }

  private async request<T>(
    endpoint: string,
    config: RequestConfig = {}
  ): Promise<T> {
    const { params, ...fetchConfig } = config;

    // Build URL with query params
    let url = `${this.baseUrl}${endpoint}`;
    if (params) {
      const searchParams = new URLSearchParams();
      Object.entries(params).forEach(([key, value]) => {
        if (value !== undefined && value !== null) {
          searchParams.append(key, String(value));
        }
      });
      const queryString = searchParams.toString();
      if (queryString) {
        url += `?${queryString}`;
      }
    }

    // Default headers
    const headers: HeadersInit = {
      'Content-Type': 'application/json',
      ...fetchConfig.headers,
    };

    try {
      const response = await fetch(url, {
        ...fetchConfig,
        cache: fetchConfig.cache ?? 'no-store',
        headers,
        credentials: 'include', // Include cookies for auth
      });

      // Handle non-2xx responses
      if (!response.ok) {
        let errorMessage = `HTTP ${response.status}: ${response.statusText}`;
        let errorData: unknown;

        try {
          const json = await response.json();
          errorMessage = json.error || json.message || errorMessage;
          errorData = json;
        } catch {
          // Not JSON, use status text
        }

        throw new ApiError(errorMessage, response.status, errorData);
      }

      // Handle 204 No Content
      if (response.status === 204) {
        return {} as T;
      }

      // Parse JSON response
      const data = await response.json();
      return data as T;
    } catch (err) {
      if (err instanceof ApiError) {
        throw err;
      }

      // Network or other errors
      throw new ApiError(
        err instanceof Error ? err.message : 'Network error occurred',
        undefined,
        err
      );
    }
  }

  async get<T = unknown>(endpoint: string, config?: RequestConfig): Promise<T> {
    return this.request<T>(endpoint, { ...config, method: 'GET' });
  }

  async post<T = unknown>(
    endpoint: string,
    data?: unknown,
    config?: RequestConfig
  ): Promise<T> {
    return this.request<T>(endpoint, {
      ...config,
      method: 'POST',
      body: data ? JSON.stringify(data) : undefined,
    });
  }

  async put<T = unknown>(
    endpoint: string,
    data?: unknown,
    config?: RequestConfig
  ): Promise<T> {
    return this.request<T>(endpoint, {
      ...config,
      method: 'PUT',
      body: data ? JSON.stringify(data) : undefined,
    });
  }

  async patch<T = unknown>(
    endpoint: string,
    data?: unknown,
    config?: RequestConfig
  ): Promise<T> {
    return this.request<T>(endpoint, {
      ...config,
      method: 'PATCH',
      body: data ? JSON.stringify(data) : undefined,
    });
  }

  async delete<T = unknown>(
    endpoint: string,
    config?: RequestConfig
  ): Promise<T> {
    return this.request<T>(endpoint, { ...config, method: 'DELETE' });
  }

  // Multipart form data upload (for files)
  async upload<T = unknown>(
    endpoint: string,
    formData: FormData,
    config?: Omit<RequestConfig, 'body'>
  ): Promise<T> {
    const { headers, ...restConfig } = config || {};
    
    // Don't set Content-Type header - browser will set it with boundary
    return this.request<T>(endpoint, {
      ...restConfig,
      method: 'POST',
      headers: {
        ...headers,
      },
      body: formData,
    });
  }
}

export const api = new ApiClient();
export { ApiError };
