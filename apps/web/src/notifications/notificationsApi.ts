import {
  listNotificationsResponseSchema,
  markNotificationReadResponseSchema,
  type NotificationSummary
} from '@taskflow/types';
import { authorizationHeaders, requireAccessToken, request } from '../api/httpClient.js';

interface ListOptions {
  unreadOnly?: boolean;
  page?: number;
  pageSize?: number;
}

const toQueryString = (options: ListOptions): string => {
  const params = new URLSearchParams();
  params.set('page', String(options.page ?? 1));
  params.set('pageSize', String(options.pageSize ?? 50));
  if (options.unreadOnly) {
    params.set('unreadOnly', 'true');
  }
  return params.toString();
};

export const notificationsApi = {
  async list(accessToken: string | null, options: ListOptions = {}): Promise<NotificationSummary[]> {
    const token = requireAccessToken(accessToken);
    const query = toQueryString(options);
    const path = query.length > 0 ? `/notifications?${query}` : '/notifications';
    const response = await request(
      path,
      {
        method: 'GET',
        headers: authorizationHeaders(token)
      },
      listNotificationsResponseSchema
    );
    return response.data;
  },
  async markRead(accessToken: string | null, notificationId: string): Promise<NotificationSummary> {
    const token = requireAccessToken(accessToken);
    const response = await request(
      `/notifications/${notificationId}/read`,
      {
        method: 'POST',
        headers: authorizationHeaders(token)
      },
      markNotificationReadResponseSchema
    );
    return response.data;
  }
};
