/**
 * Push notification utilities
 */

/**
 * Check if device is mobile
 */
const isMobile = (): boolean => {
  return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) ||
    (window.matchMedia && window.matchMedia('(max-width: 768px)').matches);
};

/**
 * Request notification permission from the user
 * On mobile, this should be called from a user interaction (button click)
 * @returns Promise<NotificationPermission>
 */
export const requestNotificationPermission = async (): Promise<NotificationPermission> => {
  if (!('Notification' in window)) {
    console.warn('This browser does not support notifications');
    return 'denied';
  }

  if (Notification.permission === 'granted') {
    return 'granted';
  }

  if (Notification.permission === 'denied') {
    console.warn('Notification permission was denied');
    return 'denied';
  }

  // On mobile, especially iOS, permission must be requested from user interaction
  // Request permission
  try {
    const permission = await Notification.requestPermission();
    console.log('Notification permission result:', permission);
    return permission;
  } catch (error) {
    console.error('Error requesting notification permission:', error);
    return 'denied';
  }
};

/**
 * Check if notification permission is granted
 * @returns boolean
 */
export const hasNotificationPermission = (): boolean => {
  return 'Notification' in window && Notification.permission === 'granted';
};

/**
 * Show a browser notification
 * @param title - Notification title
 * @param options - Notification options
 */
export const showNotification = (
  title: string,
  options: NotificationOptions = {}
): void => {
  if (!hasNotificationPermission()) {
    console.log('Notification permission not granted, skipping notification');
    return;
  }

  try {
    // On mobile, some browsers require different options
    const mobile = isMobile();
    const notificationOptions: NotificationOptions = {
      ...options,
      // Icon and badge might not work on all mobile browsers
      ...(mobile ? {} : {
        icon: '/Icons/Android/Icon-192.png',
        badge: '/Icons/Android/Icon-192.png',
      }),
      // On mobile, don't require interaction
      requireInteraction: false,
      // Vibrate on mobile if supported
      ...(mobile && 'vibrate' in navigator ? { vibrate: [200, 100, 200] } : {}),
    };

    const notification = new Notification(title, notificationOptions);

    // Auto-close after 5 seconds (or longer on mobile)
    setTimeout(() => {
      notification.close();
    }, mobile ? 8000 : 5000);

    // Handle click to focus window
    notification.onclick = () => {
      window.focus();
      notification.close();
    };

    // Handle errors
    notification.onerror = (error) => {
      console.error('Notification error:', error);
    };
  } catch (error) {
    console.error('Failed to show notification:', error);
  }
};

/**
 * Show a chat message notification
 * @param senderName - Name of the message sender
 * @param message - Message content
 * @param isFromTrainer - Whether the message is from a trainer
 */
export const showChatNotification = (senderName: string, message: string, isFromTrainer: boolean = false): void => {
  // Format: "הודעה ממאמן [name]" for trainer, "הודעה מ-[name]" for client
  const title = isFromTrainer 
    ? `הודעה ממאמן ${senderName}`
    : `הודעה מ-${senderName}`;
  
  showNotification(title, {
    body: message.length > 100 ? message.substring(0, 100) + '...' : message,
    tag: 'chat-message',
    requireInteraction: false
  });
};

