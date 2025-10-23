import { z } from 'zod';

export class ApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

const buildBaseUrl = (): string => {
  const configured = import.meta.env.VITE_API_BASE_URL;
  if (typeof configured === 'string' && configured.length > 0) {
    return configured;
  }
  const runtimeWindow = typeof window === 'undefined' ? undefined : window;
  if (runtimeWindow?.location) {
    return runtimeWindow.location.origin;
  }
  return 'http://localhost:3000';
};

export const baseUrl = buildBaseUrl();

const jsonHeaders = {
  accept: 'application/json',
  'content-type': 'application/json'
} as const;

const parseError = async (response: Response): Promise<string> => {
  const data = await response.json().catch(() => null);
  const schema = z.object({ message: z.string().optional() });
  const parsed = schema.safeParse(data);
  if (parsed.success && parsed.data.message) {
    return parsed.data.message;
  }
  return 'Request failed';
};

type RequestOptions = globalThis.RequestInit;

export const authorizationHeaders = (accessToken: string | null | undefined): Record<string, string> => {
  if (!accessToken) {
    return {};
  }
  return {
    authorization: `Bearer ${accessToken}`
  };
};

export const requireAccessToken = (accessToken: string | null | undefined): string => {
  if (!accessToken) {
    throw new ApiError('Authentication required', 401);
  }
  return accessToken;
};

export const serializeBody = (payload: unknown): string => JSON.stringify(payload);

export const request = async <Schema extends z.ZodTypeAny>(
  path: string,
  options: RequestOptions,
  schema?: Schema
): Promise<Schema extends z.ZodTypeAny ? z.infer<Schema> : void> => {
  const response = await fetch(`${baseUrl}${path}`, {
    ...options,
    credentials: 'include',
    headers: {
      ...jsonHeaders,
      ...(options.headers ?? {})
    }
  });

  if (!response.ok) {
    const detail = await parseError(response);
    throw new ApiError(detail, response.status);
  }

  if (!schema || response.status === 204) {
    return undefined as Schema extends z.ZodTypeAny ? z.infer<Schema> : void;
  }

  const data = await response.json();
  return schema.parse(data) as Schema extends z.ZodTypeAny ? z.infer<Schema> : void;
};
