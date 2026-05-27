import { API_BASE_URL } from '../config/api';

export interface Notification {
  id: number;
  title: string;
  message: string;
  type: 'info' | 'success' | 'warning' | 'error';
  recipient_id: number;
  sender_id?: number;
  is_read: boolean;
  created_at: string;
  read_at?: string;
}

export interface NotificationCreate {
  title: string;
  message: string;
  type: string;
  recipient_id: number;
}

export interface NotificationCount {
  unread_count: number;
  total_count: number;
}

class NotificationService {
  private getAuthHeaders(): HeadersInit {
    const token = localStorage.getItem('access_token');
    return {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    };
  }

  async getNotifications(limit: number = 50, offset: number = 0, unreadOnly: boolean = false): Promise<Notification[]> {
    const params = new URLSearchParams({
      limit: limit.toString(),
      offset: offset.toString(),
      unread_only: unreadOnly.toString(),
    });

    const response = await fetch(`${API_BASE_URL}/notifications/?${params}`, {
      headers: this.getAuthHeaders(),
    });

    if (!response.ok) {
      throw new Error('Failed to fetch notifications');
    }

    return response.json();
  }

  async getNotificationCount(): Promise<NotificationCount> {
    const response = await fetch(`${API_BASE_URL}/notifications/count`, {
      headers: this.getAuthHeaders(),
    });

    if (!response.ok) {
      throw new Error('Failed to fetch notification count');
    }

    return response.json();
  }

  async createNotification(notification: NotificationCreate): Promise<Notification> {
    const response = await fetch(`${API_BASE_URL}/notifications/`, {
      method: 'POST',
      headers: this.getAuthHeaders(),
      body: JSON.stringify(notification),
    });

    if (!response.ok) {
      throw new Error('Failed to create notification');
    }

    return response.json();
  }

  async markAsRead(notificationId: number): Promise<Notification> {
    const response = await fetch(`${API_BASE_URL}/notifications/${notificationId}/read`, {
      method: 'PUT',
      headers: this.getAuthHeaders(),
    });

    if (!response.ok) {
      throw new Error('Failed to mark notification as read');
    }

    return response.json();
  }

  async markAllAsRead(): Promise<{ message: string }> {
    const response = await fetch(`${API_BASE_URL}/notifications/read-all`, {
      method: 'PUT',
      headers: this.getAuthHeaders(),
    });

    if (!response.ok) {
      throw new Error('Failed to mark all notifications as read');
    }

    return response.json();
  }

  async deleteNotification(notificationId: number): Promise<{ message: string }> {
    const response = await fetch(`${API_BASE_URL}/notifications/${notificationId}`, {
      method: 'DELETE',
      headers: this.getAuthHeaders(),
    });

    if (!response.ok) {
      throw new Error('Failed to delete notification');
    }

    return response.json();
  }

  async createSystemNotification(
    title: string,
    message: string,
    type: string = 'info',
    recipientIds?: number[]
  ): Promise<{ message: string; notifications: Notification[] }> {
    const params = new URLSearchParams({
      title,
      message,
      notification_type: type,
    });

    if (recipientIds) {
      recipientIds.forEach(id => params.append('recipient_ids', id.toString()));
    }

    const response = await fetch(`${API_BASE_URL}/notifications/system?${params}`, {
      method: 'POST',
      headers: this.getAuthHeaders(),
    });

    if (!response.ok) {
      throw new Error('Failed to create system notification');
    }

    return response.json();
  }
}

export const notificationService = new NotificationService(); 