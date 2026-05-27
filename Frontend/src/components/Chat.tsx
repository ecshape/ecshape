import React, { useState, useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Send, MessageSquare, User, Clock, Check, CheckCheck, Search, ExternalLink, Link2, TrendingUp, ArrowLeft, ChevronLeft, ChevronRight, Menu } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { API_BASE_URL } from '../config/api';
import { cn } from '@/lib/utils';
import { formatChatTime, formatChatDate } from '@/lib/timezone';
import { showChatNotification, hasNotificationPermission, requestNotificationPermission } from '@/lib/notifications';

const API_BASE = API_BASE_URL || 'http://localhost:8000/api';

interface ChatMessage {
  id: number;
  trainer_id: number;
  client_id: number;
  sender_id: number;
  message: string;
  progress_entry_id: number | null;
  created_at: string;
  read_at: string | null;
}

interface Conversation {
  client_id: number;
  client_name: string;
  last_message: ChatMessage | null;
  unread_count: number;
}

interface ProgressEntry {
  id: number;
  client_id: number;
  date: string;
  weight: number;
  photo_path?: string;
  notes?: string;
  created_at: string;
}

interface ChatProps {
  selectedClientId?: number | null;
  progressEntryId?: number | null;
  onClose?: () => void;
}

const Chat: React.FC<ChatProps> = ({ selectedClientId, progressEntryId, onClose }) => {
  const { user } = useAuth();
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [selectedClient, setSelectedClient] = useState<number | null>(selectedClientId || null);
  const [messageInput, setMessageInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [progressEntries, setProgressEntries] = useState<ProgressEntry[]>([]);
  const [loadingProgress, setLoadingProgress] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [profileSidebarOpen, setProfileSidebarOpen] = useState(true);
  const [linkedProgressEntry, setLinkedProgressEntry] = useState<ProgressEntry | null>(null);
  const [progressEntriesMap, setProgressEntriesMap] = useState<Record<number, ProgressEntry>>({});
  const [photoUrls, setPhotoUrls] = useState<Record<string, string>>({});
  const [showNotificationPrompt, setShowNotificationPrompt] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const wsRef = useRef<WebSocket | null>(null);

  const isTrainer = user?.role === 'TRAINER';

  useEffect(() => {
    fetchConversations();
    
    // Check notification permission on mount
    // On mobile, show prompt if permission not granted
    const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
    if (isMobile && !hasNotificationPermission() && Notification.permission === 'default') {
      // Show prompt after a delay to allow page to load
      setTimeout(() => {
        setShowNotificationPrompt(true);
      }, 3000);
    }
  }, []);

  useEffect(() => {
    if (selectedClient) {
      fetchMessages(selectedClient);
      if (isTrainer) {
        fetchProgressEntries(selectedClient);
        setProfileSidebarOpen(true); // Open sidebar when client is selected
      }
    } else {
      setProfileSidebarOpen(false); // Close sidebar when client is deselected
    }
  }, [selectedClient, isTrainer]);

  useEffect(() => {
    // For clients, fetch messages when conversations are loaded and trainer exists
    if (!isTrainer && conversations.length > 0) {
      // Client has a trainer, fetch messages (client_id is not needed for clients)
      fetchMessages(0); // Pass 0 as placeholder, backend will use current user's trainer
      // Also fetch progress entries for clients (no client_id needed)
      fetchProgressEntries(null);
    }
  }, [conversations, isTrainer]);

  useEffect(() => {
    // Connect to WebSocket for real-time updates
    if (user?.id) {
      connectWebSocket();
      return () => {
        if (wsRef.current) {
          wsRef.current.close();
        }
      };
    }
  }, [user?.id]);

  useEffect(() => {
    // Auto-select client if provided
    if (selectedClientId && !selectedClient) {
      setSelectedClient(selectedClientId);
    }
  }, [selectedClientId]);

  useEffect(() => {
    // Scroll to bottom when new messages arrive
    scrollToBottom();
  }, [messages]);

  const connectWebSocket = () => {
    try {
      const token = localStorage.getItem('access_token');
      if (!token) return;

      const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const wsHost = API_BASE.replace(/^https?:\/\//, '').replace('/api', '');
      const wsUrl = `${wsProtocol}//${wsHost}/api/ws/ws/${user?.id}?token=${token}`;

      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        console.log('Chat WebSocket connected');
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.type === 'chat_message') {
            // Add new message to the list
            const newMessage: ChatMessage = {
              id: data.message_id,
              trainer_id: data.trainer_id || 0,
              client_id: data.client_id || 0,
              sender_id: data.sender_id,
              message: data.message,
              progress_entry_id: data.progress_entry_id || null,
              created_at: data.timestamp,
              read_at: null
            };
            
            // Check if this message is for the current conversation
            const isCurrentConversation = selectedClient && (
              (isTrainer && newMessage.client_id === selectedClient) ||
              (!isTrainer && newMessage.trainer_id === selectedClient)
            );
            
            // Only show notification if:
            // 1. User has notification permission
            // 2. Message is not from current user
            // 3. User is not viewing this conversation (or no conversation selected)
            // Show notification even if page is visible, as long as user is not viewing that conversation
            if (
              hasNotificationPermission() &&
              newMessage.sender_id !== user?.id &&
              !isCurrentConversation
            ) {
              // Get sender name from conversations or use default
              const senderName = isTrainer
                ? conversations.find(c => c.client_id === newMessage.client_id)?.client_name || t('client.client', 'Client')
                : conversations.find(c => c.client_id === newMessage.trainer_id)?.client_name || t('admin.trainer', 'Trainer');
              
              // Determine if message is from trainer (for client view) or from client (for trainer view)
              const isFromTrainer = !isTrainer; // If current user is client, then sender is trainer
              
              try {
                showChatNotification(senderName, newMessage.message, isFromTrainer);
              } catch (error) {
                console.error('Failed to show chat notification:', error);
                // On mobile, if notification fails, we could show an in-app notification instead
              }
            }
            
            setMessages((prev) => [...prev, newMessage]);
            
            // Fetch progress entry if message has one
            if (newMessage.progress_entry_id) {
              fetchProgressEntriesForMessages([newMessage.progress_entry_id]);
            }
            
            // Mark as read if it's for the current conversation
            if (isCurrentConversation) {
              markMessageRead(newMessage.id);
            }
            // Refresh conversations to update unread count
            fetchConversations();
          }
        } catch (err) {
          console.error('Failed to parse WebSocket message:', err);
        }
      };

      ws.onerror = (error) => {
        console.error('WebSocket error:', error);
      };

      ws.onclose = () => {
        console.log('WebSocket disconnected, reconnecting...');
        setTimeout(connectWebSocket, 5000);
      };
    } catch (error) {
      console.error('Failed to connect WebSocket:', error);
    }
  };

  const fetchConversations = async () => {
    try {
      const token = localStorage.getItem('access_token');
      if (!token) return;

      const response = await fetch(`${API_BASE}/v2/chat/conversations`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (response.ok) {
        const data = await response.json();
        setConversations(data);
      }
    } catch (err) {
      console.error('Failed to fetch conversations:', err);
    }
  };

  const fetchMessages = async (clientId: number) => {
    try {
      setLoading(true);
      const token = localStorage.getItem('access_token');
      if (!token) return;

      const url = isTrainer
        ? `${API_BASE}/v2/chat/messages?client_id=${clientId}`
        : `${API_BASE}/v2/chat/messages`;

      const response = await fetch(url, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (response.ok) {
        const data = await response.json();
        setMessages(data);
        
        // Fetch progress entries for messages that have progress_entry_id
        const entryIds = data
          .filter((msg: ChatMessage) => msg.progress_entry_id)
          .map((msg: ChatMessage) => msg.progress_entry_id)
          .filter((id: number | null): id is number => id !== null);
        
        if (entryIds.length > 0) {
          fetchProgressEntriesForMessages(entryIds);
        }
        
        // Mark all messages as read
        data.forEach((msg: ChatMessage) => {
          if (msg.sender_id !== user?.id && !msg.read_at) {
            markMessageRead(msg.id);
          }
        });
      }
    } catch (err) {
      console.error('Failed to fetch messages:', err);
    } finally {
      setLoading(false);
    }
  };

  const loadPhotoWithAuth = async (photoPath: string) => {
    try {
      const token = localStorage.getItem('access_token');
      if (!token || photoUrls[photoPath]) return; // Already loaded
      
      // Extract filename from photo_path
      // Path could be:
      // - Absolute: "/app/uploads/progress_photos/progress_photo_11_..._compressed.jpg"
      // - Relative: "uploads/progress_photos/progress_photo_11_..._compressed.jpg"
      // - Just filename: "progress_photo_11_..._compressed.jpg" (new entries)
      let filename = photoPath;
      
      // If it contains slashes, extract just the filename (last part after /)
      if (photoPath.includes('/')) {
        filename = photoPath.split('/').pop() || photoPath;
      }
      
      // Remove any remaining path prefixes (in case extraction didn't work)
      filename = filename.replace(/^(uploads\/progress_photos\/|.*\/progress_photos\/)/, '');
      
      // Final cleanup: ensure we have just the filename
      filename = filename.trim();
      
      // Ensure we have a valid filename
      if (!filename || (filename === photoPath && photoPath.includes('/'))) {
        console.error('Could not extract filename from path:', photoPath);
        return;
      }
      
      // API endpoint: /api/files/media/{file_type}/{filename}
      // API_BASE already includes /api, so we use /files/media/...
      const photoUrl = `${API_BASE}/files/media/progress_photos/${encodeURIComponent(filename)}`;
      console.log('Loading photo:', { 
        originalPath: photoPath, 
        extractedFilename: filename, 
        photoUrl,
        apiBase: API_BASE
      });
      
      const response = await fetch(photoUrl, {
        headers: {
          Authorization: `Bearer ${token}`
        }
      });
      
      if (response.ok) {
        const blob = await response.blob();
        const url = URL.createObjectURL(blob);
        setPhotoUrls(prev => ({ ...prev, [photoPath]: url }));
        console.log('Photo loaded successfully:', filename);
      } else {
        const errorText = await response.text().catch(() => '');
        console.error('Failed to load photo:', {
          status: response.status,
          statusText: response.statusText,
          filename,
          originalPath: photoPath,
          photoUrl,
          error: errorText
        });
      }
    } catch (error) {
      console.error('Error loading photo:', error, 'path:', photoPath);
    }
  };

  const fetchProgressEntries = async (clientId: number | null = null) => {
    try {
      setLoadingProgress(true);
      const token = localStorage.getItem('access_token');
      if (!token) return;

      // For trainers, pass client_id. For clients, don't pass it (backend uses their own ID)
      const url = isTrainer && clientId
        ? `${API_BASE}/progress/?client_id=${clientId}`
        : `${API_BASE}/progress/`;

      const response = await fetch(url, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (response.ok) {
        const data = await response.json();
        const sorted = data.sort((a: ProgressEntry, b: ProgressEntry) => 
          new Date(b.date).getTime() - new Date(a.date).getTime()
        );
        setProgressEntries(sorted);
        // Also update the map
        const map: Record<number, ProgressEntry> = {};
        sorted.forEach((entry: ProgressEntry) => {
          map[entry.id] = entry;
        });
        setProgressEntriesMap(prev => ({ ...prev, ...map }));
        
        // Load photos for entries that have photo_path
        sorted.forEach((entry: ProgressEntry) => {
          if (entry.photo_path && !photoUrls[entry.photo_path]) {
            loadPhotoWithAuth(entry.photo_path);
          }
        });
      }
    } catch (err) {
      console.error('Failed to fetch progress entries:', err);
    } finally {
      setLoadingProgress(false);
    }
  };

  const fetchProgressEntriesForMessages = async (entryIds: number[]) => {
    try {
      const token = localStorage.getItem('access_token');
      if (!token) return;

      // Fetch each entry
      const promises = entryIds.map(async (id) => {
        // Check if we already have it
        if (progressEntriesMap[id]) return null;
        
        const response = await fetch(`${API_BASE}/progress/${id}`, {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });
        
        if (response.ok) {
          const entry = await response.json();
          // Load photo if it exists
          if (entry.photo_path && !photoUrls[entry.photo_path]) {
            loadPhotoWithAuth(entry.photo_path);
          }
          return entry;
        }
        return null;
      });

      const entries = await Promise.all(promises);
      const map: Record<number, ProgressEntry> = {};
      entries.forEach((entry) => {
        if (entry) {
          map[entry.id] = entry;
          // Load photo if it exists
          if (entry.photo_path && !photoUrls[entry.photo_path]) {
            loadPhotoWithAuth(entry.photo_path);
          }
        }
      });
      setProgressEntriesMap(prev => ({ ...prev, ...map }));
    } catch (err) {
      console.error('Failed to fetch progress entries for messages:', err);
    }
  };

  const handleLinkEntryToChat = (entryId: number) => {
    console.log('Linking entry to chat:', entryId);
    console.log('Available progress entries:', progressEntries);
    console.log('Progress entries map:', progressEntriesMap);
    
    // Find the entry in progressEntries or progressEntriesMap
    let entry = progressEntries.find(e => e.id === entryId);
    if (!entry) {
      entry = progressEntriesMap[entryId];
    }
    
    console.log('Found entry:', entry);
    
    if (entry) {
      setLinkedProgressEntry(entry);
      console.log('Linked progress entry set:', entry);
      // Focus on message input
      setTimeout(() => {
        const input = document.querySelector('input[placeholder*="הקלד הודעה"]') as HTMLInputElement;
        if (input) {
          input.focus();
        } else {
          console.warn('Message input not found');
        }
      }, 100);
    } else {
      console.error('Progress entry not found:', entryId);
      // If entry not found, try fetching it
      if (selectedClient) {
        fetchProgressEntries(selectedClient).then(() => {
          const fetchedEntry = progressEntries.find(e => e.id === entryId) || progressEntriesMap[entryId];
          if (fetchedEntry) {
            setLinkedProgressEntry(fetchedEntry);
            console.log('Linked progress entry set after fetch:', fetchedEntry);
          } else {
            console.error('Still could not find entry after fetch');
          }
        });
      }
    }
  };

  const removeLinkedProgressEntry = () => {
    setLinkedProgressEntry(null);
  };

  const handleViewFullProfile = (clientId: number) => {
    navigate(`/client/${clientId}`);
  };

  const sendMessage = async () => {
    if (!messageInput.trim() && !linkedProgressEntry) return;
    if (isTrainer && !selectedClient) return;

    try {
      const token = localStorage.getItem('access_token');
      if (!token) return;

      const payload: any = {
        message: messageInput.trim() || '',
      };

      // For trainers, client_id is required
      // For clients, client_id should be their own ID (backend will verify)
      if (isTrainer) {
        payload.client_id = selectedClient;
      } else {
        payload.client_id = user?.id;
      }

      // Use linked progress entry if available
      if (linkedProgressEntry) {
        payload.progress_entry_id = linkedProgressEntry.id;
      } else if (progressEntryId) {
        payload.progress_entry_id = progressEntryId;
      }

      const response = await fetch(`${API_BASE}/v2/chat/messages`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      if (response.ok) {
        const newMessage = await response.json();
        setMessages((prev) => [...prev, newMessage]);
        setMessageInput('');
        setLinkedProgressEntry(null); // Clear linked entry after sending
        
        // Fetch progress entry if message has one
        if (newMessage.progress_entry_id) {
          fetchProgressEntriesForMessages([newMessage.progress_entry_id]);
        }
        
        fetchConversations();
        scrollToBottom();
      } else {
        const errorData = await response.json().catch(() => ({ detail: t('chat.failedToSend') }));
        console.error('Failed to send message:', errorData);
        alert(errorData.detail || t('chat.failedToSend'));
      }
    } catch (err) {
      console.error('Failed to send message:', err);
      alert(t('chat.failedToSend') + '. ' + t('chat.tryAgain'));
    }
  };

  const markMessageRead = async (messageId: number) => {
    try {
      const token = localStorage.getItem('access_token');
      if (!token) return;

      await fetch(`${API_BASE}/v2/chat/messages/${messageId}/read`, {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
    } catch (err) {
      console.error('Failed to mark message as read:', err);
    }
  };

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  // Format time for display
  const formatTime = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);

    if (minutes < 1) return t('chat.justNow', 'Just now');
    if (minutes < 60) return `${minutes} ${t('chat.minutesAgo', 'minutes')}`;
    if (hours < 24) return `${hours} ${t('chat.hoursAgo', 'hours')}`;
    if (days < 7) return `${days} ${t('chat.daysAgo', 'days')}`;
    return formatChatDate(dateString);
  };

  // Get initials for avatar
  const getInitials = (name: string) => {
    if (!name) return '?';
    return name
      .split(' ')
      .map((n) => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
  };

  if (isTrainer) {
    // Trainer view: Show list of clients, conversation, and progress sidebar
    const filteredConversations = conversations.filter(conv =>
      conv.client_name.toLowerCase().includes(searchQuery.toLowerCase())
    );

    return (
      <div className="flex flex-col md:flex-row h-full w-full bg-background overflow-hidden min-h-0 max-h-full">
        {/* Client list sidebar - Mobile: show as overlay/drawer, Desktop: visible sidebar */}
        <div className={cn(
          "flex flex-col w-full md:w-80 lg:w-96 border-r-2 border-border bg-card shrink-0 h-full overflow-hidden",
          selectedClient ? "hidden md:flex" : "flex"
        )}>
          <div className="p-4 md:p-6 border-b border-border bg-card shrink-0">
            <h2 className="text-xl md:text-2xl font-bold text-foreground mb-4">{t('chat.conversations', 'Conversations')}</h2>
            {/* Search bar */}
            <div className="relative">
              <Search className="absolute right-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                type="text"
                placeholder={t('trainer.searchClients', 'Search clients...')}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pr-10 rounded-full bg-muted/50 border-border"
              />
            </div>
          </div>
          <div className="flex-1 min-h-0 overflow-y-auto">
            {conversations.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full p-8 text-center">
                <MessageSquare className="h-16 w-16 mb-4 text-muted-foreground opacity-50" />
                <p className="text-muted-foreground">{t('chat.noConversations', 'No conversations')}</p>
              </div>
            ) : (
              <div className="divide-y divide-border">
                {filteredConversations.map((conv) => {
                  const isSelected = selectedClient === conv.client_id;
                  const lastMessageTime = conv.last_message 
                    ? formatTime(conv.last_message.created_at)
                    : '';
                  
                  return (
                    <button
                      key={conv.client_id}
                      onClick={() => setSelectedClient(conv.client_id)}
                      className={cn(
                        "w-full text-left p-4 hover:bg-muted/50 transition-all duration-200",
                        isSelected && "bg-muted border-r-2 border-r-primary"
                      )}
                    >
                      <div className="flex items-start gap-3">
                        <Avatar className="h-12 w-12 shrink-0">
                          <AvatarFallback className="bg-primary text-primary-foreground font-semibold">
                            {getInitials(conv.client_name)}
                          </AvatarFallback>
                        </Avatar>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between mb-1">
                            <p className={cn(
                              "font-semibold truncate text-sm md:text-base",
                              isSelected ? "text-foreground" : "text-foreground"
                            )}>
                              {conv.client_name}
                            </p>
                            {conv.unread_count > 0 && (
                              <Badge 
                                variant="destructive" 
                                className="ml-2 h-5 w-5 p-0 flex items-center justify-center text-xs shrink-0"
                              >
                                {conv.unread_count}
                              </Badge>
                            )}
                          </div>
                          {conv.last_message && (
                            <>
                              <p className="text-xs md:text-sm text-muted-foreground truncate mb-1">
                                {conv.last_message.message}
                              </p>
                              <div className="flex items-center gap-1 text-xs text-muted-foreground">
                                <Clock className="h-3 w-3" />
                                <span>{lastMessageTime}</span>
                              </div>
                            </>
                          )}
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Chat area */}
        <div className="flex-1 flex flex-col min-w-0 h-full overflow-hidden border-r-2 border-border relative">
          {/* Toggle button for profile sidebar */}
          {selectedClient && (
            <Button
              variant="ghost"
              size="icon"
              className="hidden lg:flex absolute right-0 top-1/2 -translate-y-1/2 translate-x-full z-50 h-10 w-10 rounded-full bg-card border-2 border-border shadow-lg hover:shadow-xl hover:bg-muted"
              onClick={() => setProfileSidebarOpen(!profileSidebarOpen)}
              aria-label={profileSidebarOpen ? 'Hide profile' : 'Show profile'}
            >
              {profileSidebarOpen ? (
                <ChevronRight className="h-5 w-5" />
              ) : (
                <ChevronLeft className="h-5 w-5" />
              )}
            </Button>
          )}
          {selectedClient ? (
            <>
              {/* Chat header */}
              <div className="p-4 md:p-6 border-b border-border bg-card/80 backdrop-blur-sm shrink-0 z-10">
                <div className="flex items-center gap-3">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="md:hidden shrink-0"
                    onClick={() => setSelectedClient(null)}
                  >
                    <ArrowLeft className="h-4 w-4" />
                  </Button>
                  <Avatar className="h-10 w-10 md:h-12 md:w-12 shrink-0">
                    <AvatarFallback className="bg-primary text-primary-foreground font-semibold">
                      {getInitials(conversations.find((c) => c.client_id === selectedClient)?.client_name || '')}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <h3 className="font-semibold text-base md:text-lg text-foreground truncate">
                      {conversations.find((c) => c.client_id === selectedClient)?.client_name || 'Client'}
                    </h3>
                    <p className="text-xs text-muted-foreground">{t('chat.online', 'Online')}</p>
                  </div>
                </div>
                
                {/* Mobile notification permission prompt */}
                {showNotificationPrompt && !hasNotificationPermission() && (
                  <div className="mt-3 p-3 bg-primary/10 border border-primary/20 rounded-lg flex items-center justify-between gap-2">
                    <div className="flex-1">
                      <p className="text-xs font-medium text-foreground mb-1">
                        {t('chat.enableNotifications', 'Enable Notifications')}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {t('chat.enableNotificationsDesc', 'Get notified about new messages')}
                      </p>
                    </div>
                    <Button
                      size="sm"
                      variant="default"
                      onClick={async () => {
                        const permission = await requestNotificationPermission();
                        if (permission === 'granted') {
                          setShowNotificationPrompt(false);
                        }
                      }}
                      className="text-xs h-8"
                    >
                      {t('chat.enable', 'Enable')}
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => setShowNotificationPrompt(false)}
                      className="text-xs h-8"
                    >
                      ×
                    </Button>
                  </div>
                )}
              </div>

              {/* Messages area */}
              <div className="flex-1 min-h-0 overflow-y-auto p-4 md:p-6 bg-gradient-to-b from-background to-muted/20">
                {loading ? (
                  <div className="flex items-center justify-center h-full">
                    <div className="text-center">
                      <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-2"></div>
                      <p className="text-sm text-muted-foreground">{t('chat.loading', 'Loading...')}</p>
                    </div>
                  </div>
                ) : messages.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-full text-center">
                    <MessageSquare className="h-16 w-16 mb-4 text-muted-foreground opacity-50" />
                    <p className="text-muted-foreground">{t('chat.noMessages', 'No messages yet. Start the conversation!')}</p>
                  </div>
                ) : (
                  <div className="space-y-3 max-w-4xl mx-auto">
                    {messages.map((msg, index) => {
                      const isOwnMessage = msg.sender_id === user?.id;
                      const prevMessage = index > 0 ? messages[index - 1] : null;
                      const showAvatar = !prevMessage || prevMessage.sender_id !== msg.sender_id;
                      const showTime = !prevMessage || 
                        new Date(msg.created_at).getTime() - new Date(prevMessage.created_at).getTime() > 300000; // 5 minutes

                      return (
                        <div key={msg.id}>
                          {showTime && (
                            <div className="flex items-center justify-center my-4">
                              <div className="px-3 py-1 bg-muted rounded-full">
                                <p className="text-xs text-muted-foreground">
                                  {formatChatDate(msg.created_at)}
                                </p>
                              </div>
                            </div>
                          )}
                          <div className={cn(
                            "flex items-end gap-2 group",
                            isOwnMessage ? "justify-end" : "justify-start"
                          )}>
                            {!isOwnMessage && (
                              <Avatar className={cn(
                                "h-8 w-8 shrink-0 transition-opacity",
                                showAvatar ? "opacity-100" : "opacity-0"
                              )}>
                                <AvatarFallback className="bg-secondary text-secondary-foreground text-xs">
                                  {getInitials(conversations.find((c) => c.client_id === selectedClient)?.client_name || '')}
                                </AvatarFallback>
                              </Avatar>
                            )}
                            <div className={cn(
                              "flex flex-col max-w-[75%] md:max-w-[60%]",
                              isOwnMessage ? "items-end" : "items-start"
                            )}>
                              <div
                                className={cn(
                                  "rounded-2xl px-4 py-2.5 shadow-sm transition-all duration-200",
                                  isOwnMessage
                                    ? "bg-primary text-primary-foreground rounded-br-md"
                                    : "bg-muted text-foreground rounded-bl-md"
                                )}
                              >
                                {msg.message && (
                                  <p className="text-sm md:text-base leading-relaxed whitespace-pre-wrap break-words">
                                    {msg.message}
                                  </p>
                                )}
                                {msg.progress_entry_id && (() => {
                                  const entry = progressEntriesMap[msg.progress_entry_id] || 
                                                progressEntries.find(e => e.id === msg.progress_entry_id);
                                  return entry ? (
                                    <div className="mt-2 flex flex-col w-[230px] h-[280px] max-h-[330px] bg-card border border-border rounded-[10px] shadow-[0px_10px_12px_rgba(0,0,0,0.08),-4px_-4px_12px_rgba(0,0,0,0.08)] overflow-hidden transition-all duration-300 cursor-pointer box-border p-[10px] hover:-translate-y-[10px] hover:shadow-[0px_20px_20px_rgba(0,0,0,0.1),-4px_-4px_12px_rgba(0,0,0,0.08)]">
                                      <div className="w-full h-[64%] rounded-[10px] mb-3 overflow-hidden bg-muted flex items-center justify-center">
                                        {entry.photo_path && photoUrls[entry.photo_path] ? (
                                          <img 
                                            src={photoUrls[entry.photo_path]}
                                            alt="Progress photo"
                                            className="w-full h-full object-cover"
                                            onError={(e) => {
                                              (e.target as HTMLImageElement).style.display = 'none';
                                            }}
                                          />
                                        ) : (
                                          <svg
                                            xmlns="http://www.w3.org/2000/svg"
                                            width="40"
                                            height="40"
                                            viewBox="0 0 1024 1024"
                                            strokeWidth="0"
                                            fill="currentColor"
                                            stroke="currentColor"
                                            className="text-muted-foreground"
                                          >
                                            <path d="M928 160H96c-17.7 0-32 14.3-32 32v640c0 17.7 14.3 32 32 32h832c17.7 0 32-14.3 32-32V192c0-17.7-14.3-32-32-32zM338 304c35.3 0 64 28.7 64 64s-28.7 64-64 64-64-28.7-64-64 28.7-64 64-64zm513.9 437.1a8.11 8.11 0 0 1-5.2 1.9H177.2c-4.4 0-8-3.6-8-8 0-1.9.7-3.7 1.9-5.2l170.3-202c2.8-3.4 7.9-3.8 11.3-1 .3.3.7.6 1 1l99.4 118 158.1-187.5c2.8-3.4 7.9-3.8 11.3-1 .3.3.7.6 1 1l229.6 271.6c2.6 3.3 2.2 8.4-1.2 11.2z"></path>
                                          </svg>
                                        )}
                                      </div>
                                      <p className="m-0 text-[17px] font-semibold text-primary cursor-default overflow-hidden line-clamp-1">
                                        {t('chat.progressEntry')} #{entry.id}
                                      </p>
                                      <p className="overflow-hidden line-clamp-3 m-0 text-[13px] text-primary/80 cursor-default mt-1">
                                        {formatChatDate(entry.date)} • {entry.weight} {t('weightProgress.kg')}
                                        {entry.notes && ` • ${entry.notes}`}
                                      </p>
                                    </div>
                                  ) : (
                                    <Badge 
                                      variant="outline" 
                                      className={cn(
                                        "mt-2 text-xs",
                                        isOwnMessage 
                                          ? "bg-primary-foreground/10 text-primary-foreground border-primary-foreground/20"
                                          : ""
                                      )}
                                    >
                                      {t('chat.linkedToEntry', 'Linked to progress entry')}
                                    </Badge>
                                  );
                                })()}
                              </div>
                              <div className={cn(
                                "flex items-center gap-1 mt-1 px-1",
                                isOwnMessage ? "flex-row-reverse" : ""
                              )}>
                                <p className="text-xs text-muted-foreground">
                                  {formatChatTime(msg.created_at)}
                                </p>
                                {isOwnMessage && (
                                  <span className="text-muted-foreground">
                                    {msg.read_at ? (
                                      <CheckCheck className="h-3 w-3 text-primary" />
                                    ) : (
                                      <Check className="h-3 w-3" />
                                    )}
                                  </span>
                                )}
                              </div>
                            </div>
                            {isOwnMessage && (
                              <Avatar className={cn(
                                "h-8 w-8 shrink-0 transition-opacity",
                                showAvatar ? "opacity-100" : "opacity-0"
                              )}>
                                <AvatarFallback className="bg-primary text-primary-foreground text-xs">
                                  {getInitials(user?.full_name || user?.username || '')}
                                </AvatarFallback>
                              </Avatar>
                            )}
                          </div>
                        </div>
                      );
                    })}
                    <div ref={messagesEndRef} />
                  </div>
                )}
              </div>

              {/* Input area */}
              <div className="p-4 md:p-6 border-t border-border bg-card/80 backdrop-blur-sm shrink-0 z-10">
                <div className="flex flex-col gap-2 max-w-4xl mx-auto">
                  {/* Linked progress entry chip */}
                  {linkedProgressEntry && (
                    <div className="flex items-center gap-2 p-2 bg-primary/10 border border-primary/20 rounded-lg">
                      <div className="flex-1 flex items-center gap-2">
                        <TrendingUp className="h-4 w-4 text-primary" />
                        <span className="text-sm font-medium text-foreground">
                          רישום התקדמות #{linkedProgressEntry.id}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {formatChatDate(linkedProgressEntry.date)} • {linkedProgressEntry.weight} קג
                        </span>
                        {linkedProgressEntry.photo_path && (
                          <Badge variant="outline" className="text-xs">📷</Badge>
                        )}
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6"
                        onClick={removeLinkedProgressEntry}
                        aria-label="Remove linked progress entry"
                      >
                        <span className="text-xs">×</span>
                      </Button>
                    </div>
                  )}
                  
                  <div className="flex gap-2 md:gap-3 items-end">
                    <div className="flex-1 relative">
                      <Input
                        value={messageInput}
                        onChange={(e) => setMessageInput(e.target.value)}
                        onKeyDown={handleKeyDown}
                        placeholder={t('chat.typeMessage', 'Type a message...')}
                        className="rounded-full pr-12 h-11 md:h-12 bg-muted/50 border-border focus:bg-background transition-colors"
                        disabled={!selectedClient}
                      />
                    </div>
                    <Button 
                      onClick={sendMessage} 
                      size="icon"
                      className="h-11 w-11 md:h-12 md:w-12 rounded-full shrink-0 gradient-orange hover:gradient-orange-dark shadow-lg hover:shadow-xl transition-all"
                      disabled={(!messageInput.trim() && !linkedProgressEntry) || !selectedClient}
                      aria-label={t('chat.send', 'Send message')}
                    >
                      <Send className="h-4 w-4 md:h-5 md:w-5" />
                    </Button>
                  </div>
                </div>
              </div>
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center text-muted-foreground">
              <div className="text-center p-8">
                <MessageSquare className="h-16 w-16 md:h-20 md:w-20 mx-auto mb-4 opacity-50" />
                <p className="text-base md:text-lg">{t('chat.selectClient', 'Select a client to start chatting')}</p>
              </div>
            </div>
          )}
        </div>

        {/* Client profile & progress sidebar - Only show when client is selected */}
        {selectedClient && profileSidebarOpen && (() => {
          const selectedClientData = conversations.find((c) => c.client_id === selectedClient);
          return (
            <div className="hidden lg:flex flex-col w-80 xl:w-96 border-l-2 border-border bg-card shrink-0 h-full overflow-hidden relative">
              {/* Retract button inside sidebar */}
              <Button
                variant="ghost"
                size="icon"
                className="absolute left-0 top-1/2 -translate-y-1/2 -translate-x-full z-50 h-10 w-10 rounded-r-full rounded-l-none bg-card border-2 border-l-0 border-border shadow-lg hover:shadow-xl hover:bg-muted"
                onClick={() => setProfileSidebarOpen(false)}
                aria-label="Hide profile"
              >
                <ChevronLeft className="h-5 w-5" />
              </Button>
              
              {/* Client Profile Card - Simplified */}
              <div className="p-4 md:p-6 border-b border-border bg-card shrink-0">
                <div className="flex flex-col items-center text-center space-y-3">
                  <Avatar className="h-16 w-16 md:h-20 md:w-20">
                    <AvatarFallback className="bg-primary text-primary-foreground font-semibold text-lg">
                      {getInitials(selectedClientData?.client_name || '')}
                    </AvatarFallback>
                  </Avatar>
                  <div className="w-full">
                    <h3 className="font-bold text-xl md:text-2xl text-foreground mb-2">
                      {selectedClientData?.client_name || 'Client'}
                    </h3>
                    <Button
                      variant="outline"
                      size="sm"
                      className="w-full"
                      onClick={() => handleViewFullProfile(selectedClient)}
                    >
                      <ExternalLink className="h-4 w-4 ml-1" />
                      {t('trainer.viewProfile', 'צפה בפרופיל')}
                    </Button>
                  </div>
                </div>
              </div>

              {/* Progress Entries Section */}
              <div className="flex-1 overflow-hidden flex flex-col min-h-0">
                <div className="p-3 border-b border-border bg-card shrink-0">
                  <div className="flex items-center gap-2">
                    <TrendingUp className="h-4 w-4 text-primary" />
                    <h2 className="text-base font-semibold text-foreground">{t('progress.progress', 'Progress')}</h2>
                  </div>
                </div>
                <div className="flex-1 min-h-0 overflow-y-auto p-3">
                  {loadingProgress ? (
                    <div className="flex items-center justify-center h-full p-8">
                      <div className="text-center">
                        <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-2"></div>
                        <p className="text-sm text-muted-foreground">{t('chat.loading', 'Loading...')}</p>
                      </div>
                    </div>
                  ) : progressEntries.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-full p-8 text-center">
                      <TrendingUp className="h-16 w-16 mb-4 text-muted-foreground opacity-50" />
                      <p className="text-muted-foreground">{t('progress.noEntries', 'No progress entries')}</p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {progressEntries.map((entry) => (
                        <Card 
                          key={entry.id} 
                          className="hover:shadow-md transition-all duration-200 cursor-pointer border-border"
                          onClick={(e) => {
                            e.preventDefault();
                            handleLinkEntryToChat(entry.id);
                          }}
                        >
                          <CardContent className="p-3">
                            <div className="flex items-start justify-between mb-2">
                              <div className="flex-1 min-w-0">
                                <p className="font-semibold text-xs text-foreground mb-1">
                                  {formatChatDate(entry.date)}
                                </p>
                                <div className="flex items-center gap-2 text-xs">
                                  <span className="text-muted-foreground">{t('weightProgress.weight')}:</span>
                                  <span className="font-semibold text-foreground">{entry.weight} {t('weightProgress.kg')}</span>
                                </div>
                                {entry.notes && (
                                  <p className="text-xs text-muted-foreground mt-1 line-clamp-1">{entry.notes}</p>
                                )}
                                {entry.photo_path && (
                                  <Badge variant="outline" className="mt-1 text-xs px-1.5 py-0">
                                    📷
                                  </Badge>
                                )}
                              </div>
                            </div>
                            <div className="flex items-center gap-1 mt-2 pt-2 border-t border-border">
                              <Button
                                size="sm"
                                variant="outline"
                                className="flex-1 text-xs h-7"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleLinkEntryToChat(entry.id);
                                }}
                              >
                                <Link2 className="h-3 w-3 ml-1" />
                                {t('chat.linkToChat', 'Link to Chat')}
                              </Button>
                            </div>
                          </CardContent>
                        </Card>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          );
        })()}
      </div>
    );
  } else {
    // Client view: Show conversation with trainer
    const trainerConversation = conversations.length > 0 ? conversations[0] : null;

    return (
      <div className="flex flex-col h-full w-full bg-background overflow-hidden min-h-0 max-h-full">
        {trainerConversation ? (
          <>
            {/* Chat header */}
            <div className="p-4 md:p-6 border-b border-border bg-card/80 backdrop-blur-sm shrink-0 z-10">
              <div className="flex items-center gap-3">
                <Avatar className="h-10 w-10 md:h-12 md:w-12">
                  <AvatarFallback className="bg-primary text-primary-foreground font-semibold">
                    {getInitials(trainerConversation.client_name)}
                  </AvatarFallback>
                </Avatar>
                <div>
                  <h3 className="font-semibold text-base md:text-lg text-foreground">
                    {trainerConversation.client_name}
                  </h3>
                  <p className="text-xs text-muted-foreground">{t('chat.online', 'מקוון')}</p>
                </div>
              </div>
              
              {/* Mobile notification permission prompt */}
              {showNotificationPrompt && !hasNotificationPermission() && (
                <div className="mt-3 p-3 bg-primary/10 border border-primary/20 rounded-lg flex items-center justify-between gap-2">
                  <div className="flex-1">
                    <p className="text-xs font-medium text-foreground mb-1">
                      {t('chat.enableNotifications', 'הפעל התראות')}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {t('chat.enableNotificationsDesc', 'קבל התראות על הודעות חדשות')}
                    </p>
                  </div>
                  <Button
                    size="sm"
                    variant="default"
                    onClick={async () => {
                      const permission = await requestNotificationPermission();
                      if (permission === 'granted') {
                        setShowNotificationPrompt(false);
                      }
                    }}
                    className="text-xs h-8"
                  >
                    {t('chat.enable', 'הפעל')}
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setShowNotificationPrompt(false)}
                    className="text-xs h-8"
                  >
                    ×
                  </Button>
                </div>
              )}
            </div>

            {/* Messages area */}
            <div className="flex-1 min-h-0 overflow-y-auto p-4 md:p-6 bg-gradient-to-b from-background to-muted/20">
              {loading ? (
                <div className="flex items-center justify-center h-full">
                  <div className="text-center">
                    <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-2"></div>
                    <p className="text-sm text-muted-foreground">{t('chat.loading', 'טוען...')}</p>
                  </div>
                </div>
              ) : messages.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-center">
                  <MessageSquare className="h-16 w-16 mb-4 text-muted-foreground opacity-50" />
                  <p className="text-muted-foreground">{t('chat.noMessages', 'אין הודעות עדיין. התחל את השיחה!')}</p>
                </div>
              ) : (
                <div className="space-y-3 max-w-4xl mx-auto">
                  {messages.map((msg, index) => {
                    const isOwnMessage = msg.sender_id === user?.id;
                    const prevMessage = index > 0 ? messages[index - 1] : null;
                    const showAvatar = !prevMessage || prevMessage.sender_id !== msg.sender_id;
                    const showTime = !prevMessage || 
                      new Date(msg.created_at).getTime() - new Date(prevMessage.created_at).getTime() > 300000; // 5 minutes

                    return (
                      <div key={msg.id}>
                        {showTime && (
                          <div className="flex items-center justify-center my-4">
                            <div className="px-3 py-1 bg-muted rounded-full">
                              <p className="text-xs text-muted-foreground">
                                {formatChatDate(msg.created_at)}
                              </p>
                            </div>
                          </div>
                        )}
                        <div className={cn(
                          "flex items-end gap-2 group",
                          isOwnMessage ? "justify-end" : "justify-start"
                        )}>
                          {!isOwnMessage && (
                            <Avatar className={cn(
                              "h-8 w-8 shrink-0 transition-opacity",
                              showAvatar ? "opacity-100" : "opacity-0"
                            )}>
                              <AvatarFallback className="bg-secondary text-secondary-foreground text-xs">
                                {getInitials(t('chat.trainer', 'Trainer'))}
                              </AvatarFallback>
                            </Avatar>
                          )}
                          <div className={cn(
                            "flex flex-col max-w-[75%] md:max-w-[60%]",
                            isOwnMessage ? "items-end" : "items-start"
                          )}>
                            <div
                              className={cn(
                                "rounded-2xl px-4 py-2.5 shadow-sm transition-all duration-200",
                                isOwnMessage
                                  ? "bg-primary text-primary-foreground rounded-br-md"
                                  : "bg-muted text-foreground rounded-bl-md"
                              )}
                            >
                              <p className="text-sm md:text-base leading-relaxed whitespace-pre-wrap break-words">
                                {msg.message}
                              </p>
                              {msg.progress_entry_id && (() => {
                                const entry = progressEntriesMap[msg.progress_entry_id] || 
                                              progressEntries.find(e => e.id === msg.progress_entry_id);
                                return entry ? (
                                    <div className="mt-2 flex flex-col w-[230px] h-[280px] max-h-[330px] bg-card border border-border rounded-[10px] shadow-[0px_10px_12px_rgba(0,0,0,0.08),-4px_-4px_12px_rgba(0,0,0,0.08)] overflow-hidden transition-all duration-300 cursor-pointer box-border p-[10px] hover:-translate-y-[10px] hover:shadow-[0px_20px_20px_rgba(0,0,0,0.1),-4px_-4px_12px_rgba(0,0,0,0.08)]">
                                      <div className="w-full h-[64%] rounded-[10px] mb-3 overflow-hidden bg-muted flex items-center justify-center">
                                        {entry.photo_path && photoUrls[entry.photo_path] ? (
                                          <img 
                                            src={photoUrls[entry.photo_path]}
                                            alt="Progress photo"
                                            className="w-full h-full object-cover"
                                            onError={(e) => {
                                              (e.target as HTMLImageElement).style.display = 'none';
                                            }}
                                          />
                                        ) : (
                                          <svg
                                            xmlns="http://www.w3.org/2000/svg"
                                            width="40"
                                            height="40"
                                            viewBox="0 0 1024 1024"
                                            strokeWidth="0"
                                            fill="currentColor"
                                            stroke="currentColor"
                                            className="text-muted-foreground"
                                          >
                                            <path d="M928 160H96c-17.7 0-32 14.3-32 32v640c0 17.7 14.3 32 32 32h832c17.7 0 32-14.3 32-32V192c0-17.7-14.3-32-32-32zM338 304c35.3 0 64 28.7 64 64s-28.7 64-64 64-64-28.7-64-64 28.7-64 64-64zm513.9 437.1a8.11 8.11 0 0 1-5.2 1.9H177.2c-4.4 0-8-3.6-8-8 0-1.9.7-3.7 1.9-5.2l170.3-202c2.8-3.4 7.9-3.8 11.3-1 .3.3.7.6 1 1l99.4 118 158.1-187.5c2.8-3.4 7.9-3.8 11.3-1 .3.3.7.6 1 1l229.6 271.6c2.6 3.3 2.2 8.4-1.2 11.2z"></path>
                                          </svg>
                                        )}
                                      </div>
                                      <p className="m-0 text-[17px] font-semibold text-primary cursor-default overflow-hidden line-clamp-1">
                                        {t('chat.progressEntry')} #{entry.id}
                                      </p>
                                      <p className="overflow-hidden line-clamp-3 m-0 text-[13px] text-primary/80 cursor-default mt-1">
                                        {formatChatDate(entry.date)} • {entry.weight} {t('weightProgress.kg')}
                                        {entry.notes && ` • ${entry.notes}`}
                                      </p>
                                    </div>
                                ) : (
                                  <Badge 
                                    variant="outline" 
                                    className={cn(
                                      "mt-2 text-xs",
                                      isOwnMessage 
                                        ? "bg-primary-foreground/10 text-primary-foreground border-primary-foreground/20"
                                        : ""
                                    )}
                                  >
                                    {t('chat.linkedToEntry', 'קשור לרישום התקדמות')}
                                  </Badge>
                                );
                              })()}
                            </div>
                            <div className={cn(
                              "flex items-center gap-1 mt-1 px-1",
                              isOwnMessage ? "flex-row-reverse" : ""
                            )}>
                              <p className="text-xs text-muted-foreground">
                                {formatChatTime(msg.created_at)}
                              </p>
                              {isOwnMessage && (
                                <span className="text-muted-foreground">
                                  {msg.read_at ? (
                                    <CheckCheck className="h-3 w-3 text-primary" />
                                  ) : (
                                    <Check className="h-3 w-3" />
                                  )}
                                </span>
                              )}
                            </div>
                          </div>
                          {isOwnMessage && (
                            <Avatar className={cn(
                              "h-8 w-8 shrink-0 transition-opacity",
                              showAvatar ? "opacity-100" : "opacity-0"
                            )}>
                              <AvatarFallback className="bg-primary text-primary-foreground text-xs">
                                {getInitials(user?.full_name || user?.username || '')}
                              </AvatarFallback>
                            </Avatar>
                          )}
                        </div>
                      </div>
                    );
                  })}
                  <div ref={messagesEndRef} />
                </div>
              )}
            </div>

            {/* Input area */}
            <div className="p-4 md:p-6 border-t border-border bg-card/80 backdrop-blur-sm shrink-0 z-10">
              <div className="flex gap-2 md:gap-3 items-end max-w-4xl mx-auto">
                <div className="flex-1 relative">
                  <Input
                    value={messageInput}
                    onChange={(e) => setMessageInput(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder={t('chat.typeMessage', 'הקלד הודעה...')}
                    className="rounded-full pr-12 h-11 md:h-12 bg-muted/50 border-border focus:bg-background transition-colors"
                    disabled={!trainerConversation}
                  />
                </div>
                <Button 
                  onClick={sendMessage} 
                  size="icon"
                  className="h-11 w-11 md:h-12 md:w-12 rounded-full shrink-0 gradient-orange hover:gradient-orange-dark shadow-lg hover:shadow-xl transition-all"
                  disabled={!messageInput.trim() || !trainerConversation}
                  aria-label={t('chat.send', 'שלח הודעה')}
                >
                  <Send className="h-4 w-4 md:h-5 md:w-5" />
                </Button>
              </div>
            </div>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center text-muted-foreground">
            <div className="text-center p-8">
              <MessageSquare className="h-16 w-16 md:h-20 md:w-20 mx-auto mb-4 opacity-50" />
              <p className="text-base md:text-lg">{t('chat.noTrainer', 'No trainer assigned')}</p>
            </div>
          </div>
        )}
      </div>
    );
  }
};

export default Chat;

