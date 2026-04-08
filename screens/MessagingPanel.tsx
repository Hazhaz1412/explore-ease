import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import * as ImagePicker from 'expo-image-picker';
import * as Location from 'expo-location';
import {
  apiBaseUrl,
  chatApi,
  ChatEventSummary,
  ChatMessageKind,
  ChatParticipant,
  ChatScope,
  sessionStore,
} from '../services/backend';
import {
  decryptChatMessage,
  type DecryptedChatMessage,
  encryptChatPayload,
  ensureChatPublicKeyPublished,
} from '../services/chatCrypto';
import { subscribeChatRealtime } from '../services/chatRealtime';

const formatStamp = (iso: string | null | undefined) => {
  if (!iso) return '';
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) return iso;
  return parsed.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
};

const formatEventDate = (iso: string | null | undefined) => {
  if (!iso) return 'No schedule';
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) return iso;
  return parsed.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
};

const messagePreview = (message: DecryptedChatMessage) => {
  if (message.unreadable || !message.payload) {
    return 'Encrypted message could not be decrypted on this device.';
  }
  if (message.payload.kind === 'TEXT') {
    return message.payload.text;
  }
  if (message.payload.kind === 'IMAGE') {
    return 'Shared an image';
  }
  return message.payload.label || `${message.payload.latitude.toFixed(4)}, ${message.payload.longitude.toFixed(4)}`;
};

const resolveAvatarUri = (value: string | null | undefined) => {
  if (!value) return null;
  if (value.startsWith('http://') || value.startsWith('https://') || value.startsWith('data:') || value.startsWith('blob:')) {
    return value;
  }
  if (value.startsWith('/')) {
    return `${apiBaseUrl}${value}`;
  }
  return `${apiBaseUrl}/${value}`;
};

const MessagingPanel = () => {
  const currentUser = sessionStore.get()?.user;
  const scrollRef = useRef<ScrollView | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [sending, setSending] = useState(false);
  const [events, setEvents] = useState<ChatEventSummary[]>([]);
  const [selectedEventId, setSelectedEventId] = useState<number | null>(null);
  const [participants, setParticipants] = useState<ChatParticipant[]>([]);
  const [scope, setScope] = useState<ChatScope>('GROUP');
  const [directUserId, setDirectUserId] = useState<number | null>(null);
  const [messages, setMessages] = useState<DecryptedChatMessage[]>([]);
  const [pinnedMessages, setPinnedMessages] = useState<DecryptedChatMessage[]>([]);
  const [draft, setDraft] = useState('');

  const selectedEvent = useMemo(
    () => events.find((item) => item.eventId === selectedEventId) || null,
    [events, selectedEventId]
  );

  const directPeers = useMemo(
    () => participants.filter((participant) => participant.directAllowed && !participant.currentUser),
    [participants]
  );

  const selectedDirectPeer = useMemo(
    () => directPeers.find((participant) => participant.userId === directUserId) || null,
    [directPeers, directUserId]
  );

  const selectedRecipients = useMemo(() => {
    if (scope === 'GROUP') {
      return participants;
    }
    if (!selectedDirectPeer || !currentUser) {
      return [];
    }
    return participants.filter(
      (participant) => participant.currentUser || participant.userId === selectedDirectPeer.userId
    );
  }, [participants, scope, selectedDirectPeer, currentUser]);

  const missingKeys = useMemo(
    () =>
      selectedRecipients
        .filter((recipient) => !recipient.publicKey)
        .map((recipient) => recipient.username),
    [selectedRecipients]
  );

  const canPinMessages = !!selectedEvent?.organizer;

  const loadEvents = useCallback(
    async (showSpinner = false) => {
      if (showSpinner) {
        setLoading(true);
      } else {
        setRefreshing(true);
      }
      try {
        await ensureChatPublicKeyPublished();
        const payload = await chatApi.listEvents();
        setEvents(payload);
        setSelectedEventId((previous) => {
          if (previous && payload.some((event) => event.eventId === previous)) {
            return previous;
          }
          return payload[0]?.eventId ?? null;
        });
      } catch (error: any) {
        Alert.alert('Chat unavailable', error?.message || 'Cannot load chat events.');
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    []
  );

  const loadParticipants = useCallback(
    async (eventId: number) => {
      try {
        const payload = await chatApi.getParticipants(eventId);
        setParticipants(payload);

        const peers = payload.filter((participant) => participant.directAllowed && !participant.currentUser);
        setDirectUserId((previous) => {
          if (previous && peers.some((peer) => peer.userId === previous)) {
            return previous;
          }
          return peers[0]?.userId ?? null;
        });
        if (scope === 'DIRECT' && peers.length === 0) {
          setScope('GROUP');
        }
      } catch (error: any) {
        Alert.alert('Error', error?.message || 'Cannot load chat participants.');
      }
    },
    [scope]
  );

  const loadMessages = useCallback(
    async (eventId: number, activeScope: ChatScope, counterpartUserId?: number | null) => {
      if (activeScope === 'DIRECT' && !counterpartUserId) {
        setMessages([]);
        return;
      }
      try {
        const payload = await chatApi.getMessages({
          eventId,
          scope: activeScope,
          counterpartUserId,
          limit: 60,
        });
        const decrypted = await Promise.all(payload.map((item) => decryptChatMessage(item)));
        setMessages(decrypted);
      } catch (error: any) {
        Alert.alert('Error', error?.message || 'Cannot load messages.');
      }
    },
    []
  );

  const loadPins = useCallback(async (eventId: number) => {
    try {
      const payload = await chatApi.getPinnedMessages(eventId);
      const decrypted = await Promise.all(payload.map((item) => decryptChatMessage(item)));
      setPinnedMessages(decrypted);
    } catch (error: any) {
      Alert.alert('Error', error?.message || 'Cannot load pinned notices.');
    }
  }, []);

  const refreshCurrentThread = useCallback(async () => {
    if (!selectedEventId) return;
    await loadMessages(selectedEventId, scope, directUserId);
    if (scope === 'GROUP') {
      await loadPins(selectedEventId);
    } else {
      setPinnedMessages([]);
    }
  }, [selectedEventId, scope, directUserId, loadMessages, loadPins]);

  useEffect(() => {
    void loadEvents(true);
  }, [loadEvents]);

  useEffect(() => {
    if (!selectedEventId) {
      setParticipants([]);
      setMessages([]);
      setPinnedMessages([]);
      return;
    }
    void loadParticipants(selectedEventId);
    if (scope === 'GROUP') {
      void loadPins(selectedEventId);
    }
  }, [selectedEventId, scope, loadParticipants, loadPins]);

  useEffect(() => {
    if (!selectedEventId) return;
    void loadMessages(selectedEventId, scope, directUserId);
  }, [selectedEventId, scope, directUserId, loadMessages]);

  useEffect(() => {
    const unsubscribe = subscribeChatRealtime((event) => {
      const eventId = Number(event?.payload?.eventId || 0);
      void loadEvents(false);
      if (selectedEventId && eventId === selectedEventId) {
        void refreshCurrentThread();
      }
    });
    return unsubscribe;
  }, [selectedEventId, refreshCurrentThread, loadEvents]);

  useEffect(() => {
    const timer = setTimeout(() => {
      scrollRef.current?.scrollToEnd({ animated: true });
    }, 60);
    return () => clearTimeout(timer);
  }, [messages.length]);

  const sendEncryptedMessage = useCallback(
    async (kind: ChatMessageKind, payload: Record<string, unknown>) => {
      if (!selectedEventId) {
        return;
      }
      if (missingKeys.length > 0) {
        Alert.alert('Encryption unavailable', `Missing public key for: ${missingKeys.join(', ')}`);
        return;
      }
      if (selectedRecipients.length === 0) {
        Alert.alert('No recipients', 'Select a valid chat thread before sending.');
        return;
      }

      try {
        setSending(true);
        const encrypted = await encryptChatPayload(
          kind,
          payload,
          selectedRecipients.map((recipient) => ({
            userId: recipient.userId,
            publicKey: recipient.publicKey as string,
          }))
        );

        await chatApi.sendMessage({
          eventId: selectedEventId,
          scope,
          counterpartUserId: scope === 'DIRECT' ? directUserId : null,
          kind,
          ciphertext: encrypted.ciphertext,
          contentNonce: encrypted.contentNonce,
          encryptedKeys: encrypted.encryptedKeys,
        });

        setDraft('');
        await refreshCurrentThread();
        await loadEvents(false);
      } catch (error: any) {
        Alert.alert('Send failed', error?.message || 'Cannot send message.');
      } finally {
        setSending(false);
      }
    },
    [selectedEventId, scope, directUserId, selectedRecipients, refreshCurrentThread, loadEvents, missingKeys]
  );

  const handleSendText = async () => {
    const value = draft.trim();
    if (!value) {
      return;
    }
    await sendEncryptedMessage('TEXT', { text: value });
  };

  const handleSendImage = async () => {
    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (permission.status !== 'granted') {
        Alert.alert('Permission required', 'Allow photo library access to send images.');
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsMultipleSelection: false,
        base64: true,
        quality: 0.65,
      });

      if (result.canceled || !result.assets?.[0]?.base64) {
        return;
      }

      const asset = result.assets[0];
      await sendEncryptedMessage('IMAGE', {
        imageBase64: asset.base64,
        mimeType: asset.mimeType || 'image/jpeg',
        width: asset.width || null,
        height: asset.height || null,
      });
    } catch (error: any) {
      Alert.alert('Image send failed', error?.message || 'Cannot share image.');
    }
  };

  const handleSendLocation = async () => {
    try {
      const permission = await Location.requestForegroundPermissionsAsync();
      if (permission.status !== 'granted') {
        Alert.alert('Permission required', 'Allow location access to share your position.');
        return;
      }
      const position = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });
      await sendEncryptedMessage('LOCATION', {
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
        label: selectedEvent?.locationName || 'Shared live location',
      });
    } catch (error: any) {
      Alert.alert('Location send failed', error?.message || 'Cannot share location.');
    }
  };

  const handleTogglePin = async (message: DecryptedChatMessage) => {
    if (!selectedEventId) return;
    try {
      if (message.pinned) {
        await chatApi.unpinMessage(selectedEventId, message.id);
      } else {
        await chatApi.pinMessage(selectedEventId, message.id);
      }
      await refreshCurrentThread();
      await loadEvents(false);
    } catch (error: any) {
      Alert.alert('Pin failed', error?.message || 'Cannot update pinned notice.');
    }
  };

  const openLocation = async (message: DecryptedChatMessage) => {
    if (!message.payload || message.payload.kind !== 'LOCATION') {
      return;
    }
    const url = `https://www.google.com/maps/search/?api=1&query=${message.payload.latitude},${message.payload.longitude}`;
    await Linking.openURL(url);
  };

  if (!currentUser) {
    return (
      <View style={styles.emptyState}>
        <Text style={styles.emptyTitle}>Chat requires login</Text>
      </View>
    );
  }

  if (loading) {
    return (
      <View style={styles.loadingWrap}>
        <ActivityIndicator color="#f97316" />
        <Text style={styles.loadingText}>Preparing encrypted chat…</Text>
      </View>
    );
  }

  if (events.length === 0) {
    return (
      <View style={styles.emptyState}>
        <Text style={styles.emptyTitle}>No chat threads yet</Text>
        <Text style={styles.emptyMeta}>Join an event or create one to unlock group and organizer messaging.</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.eventRail}>
        {events.map((event) => (
          <Pressable
            key={event.eventId}
            onPress={() => setSelectedEventId(event.eventId)}
            style={[styles.eventChip, selectedEventId === event.eventId && styles.eventChipActive]}
          >
            <Text style={styles.eventChipTitle}>{event.title}</Text>
            <Text style={styles.eventChipMeta}>
              {formatEventDate(event.startDate)} • {event.participantCount} members
            </Text>
          </Pressable>
        ))}
      </ScrollView>

      {selectedEvent ? (
        <Animated.View entering={FadeInDown.duration(260)} style={styles.threadCard}>
          <View style={styles.threadHeader}>
            <View>
              <Text style={styles.threadTitle}>{selectedEvent.title}</Text>
              <Text style={styles.threadMeta}>
                {selectedEvent.locationName || 'No location'} • Host {selectedEvent.organizerUsername}
              </Text>
            </View>
            <Pressable onPress={() => void loadEvents(false)} style={styles.refreshButton}>
              <Text style={styles.refreshButtonText}>{refreshing ? 'Syncing…' : 'Refresh'}</Text>
            </Pressable>
          </View>

          <View style={styles.scopeRow}>
            <Pressable
              onPress={() => setScope('GROUP')}
              style={[styles.scopeButton, scope === 'GROUP' && styles.scopeButtonActive]}
            >
              <Text style={styles.scopeText}>Event Group</Text>
            </Pressable>
            {directPeers.map((peer) => (
              <Pressable
                key={peer.userId}
                onPress={() => {
                  setScope('DIRECT');
                  setDirectUserId(peer.userId);
                }}
                style={[
                  styles.scopeButton,
                  scope === 'DIRECT' && directUserId === peer.userId && styles.scopeButtonActive,
                ]}
              >
                <View style={styles.scopePeerWrap}>
                  {resolveAvatarUri(peer.profilePictureUrl) ? (
                    <Image source={{ uri: resolveAvatarUri(peer.profilePictureUrl)! }} style={styles.scopePeerAvatar} />
                  ) : (
                    <View style={styles.scopePeerAvatarFallback}>
                      <Text style={styles.scopePeerAvatarText}>{peer.username?.charAt(0).toUpperCase() || '?'}</Text>
                    </View>
                  )}
                  <Text style={styles.scopeText}>{peer.organizer ? 'Organizer' : peer.username}</Text>
                </View>
              </Pressable>
            ))}
          </View>

          {scope === 'GROUP' && pinnedMessages.length > 0 ? (
            <View style={styles.pinSection}>
              <Text style={styles.pinSectionTitle}>Pinned notices</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                {pinnedMessages.map((message) => (
                  <View key={message.id} style={styles.pinCard}>
                    <Text style={styles.pinCardMeta}>
                      {message.senderName} • {formatStamp(message.pinnedAt || message.createdAt)}
                    </Text>
                    <Text style={styles.pinCardText}>{messagePreview(message)}</Text>
                  </View>
                ))}
              </ScrollView>
            </View>
          ) : null}

          {missingKeys.length > 0 ? (
            <View style={styles.warningCard}>
              <Text style={styles.warningText}>
                Encryption is blocked until these members publish a chat key: {missingKeys.join(', ')}
              </Text>
            </View>
          ) : null}

          <ScrollView ref={scrollRef} style={styles.messageList} contentContainerStyle={styles.messageListContent}>
            {messages.length === 0 ? (
              <View style={styles.emptyThread}>
                <Text style={styles.emptyThreadTitle}>No messages yet</Text>
                <Text style={styles.emptyThreadMeta}>
                  {scope === 'GROUP'
                    ? 'Start the event discussion with an encrypted message.'
                    : `Start a private thread with ${selectedDirectPeer?.username || 'the organizer'}.`}
                </Text>
              </View>
            ) : null}

            {messages.map((message, index) => {
              const mine = message.senderId === currentUser.id;
              const locationPayload = message.payload?.kind === 'LOCATION' ? message.payload : null;
              const imagePayload = message.payload?.kind === 'IMAGE' ? message.payload : null;
              const senderAvatarUri = resolveAvatarUri(message.senderProfilePictureUrl);
              const imageUri = imagePayload?.imageBase64
                ? `data:${imagePayload.mimeType || 'image/jpeg'};base64,${imagePayload.imageBase64}`
                : null;

              return (
                <Animated.View
                  key={message.id}
                  entering={FadeInDown.delay(index * 18).duration(220)}
                  style={[styles.messageBubble, mine ? styles.messageBubbleMine : styles.messageBubbleTheirs]}
                >
                  <View style={styles.messageTopRow}>
                    <View style={styles.messageSenderWrap}>
                      {senderAvatarUri ? (
                        <Image source={{ uri: senderAvatarUri }} style={styles.messageSenderAvatar} />
                      ) : (
                        <View style={styles.messageSenderAvatarFallback}>
                          <Text style={styles.messageSenderAvatarText}>{(mine ? 'Y' : message.senderName?.charAt(0).toUpperCase()) || '?'}</Text>
                        </View>
                      )}
                      <Text style={styles.messageSender}>{mine ? 'You' : message.senderName}</Text>
                    </View>
                    <Text style={styles.messageTime}>{formatStamp(message.createdAt)}</Text>
                  </View>

                  {message.unreadable || !message.payload ? (
                    <Text style={styles.messageBodyMuted}>Encrypted message could not be decrypted on this device.</Text>
                  ) : null}

                  {message.payload?.kind === 'TEXT' ? (
                    <Text style={styles.messageBody}>{message.payload.text}</Text>
                  ) : null}

                  {imageUri ? <Image source={{ uri: imageUri }} style={styles.messageImage} /> : null}

                  {locationPayload ? (
                    <Pressable onPress={() => void openLocation(message)} style={styles.locationCard}>
                      <Text style={styles.locationTitle}>{locationPayload.label || 'Shared location'}</Text>
                      <Text style={styles.locationMeta}>
                        {locationPayload.latitude.toFixed(5)}, {locationPayload.longitude.toFixed(5)}
                      </Text>
                      <Text style={styles.locationLink}>Open in Maps</Text>
                    </Pressable>
                  ) : null}

                  {scope === 'GROUP' && canPinMessages ? (
                    <Pressable onPress={() => void handleTogglePin(message)} style={styles.pinToggle}>
                      <Text style={styles.pinToggleText}>{message.pinned ? 'Unpin' : 'Pin important'}</Text>
                    </Pressable>
                  ) : null}

                  {message.pinned ? (
                    <Text style={styles.pinnedLabel}>
                      Pinned by {message.pinnedByName || 'organizer'}
                    </Text>
                  ) : null}
                </Animated.View>
              );
            })}
          </ScrollView>

          <View style={styles.composerCard}>
            <View style={styles.actionRow}>
              <Pressable onPress={() => void handleSendImage()} style={styles.actionButton}>
                <Text style={styles.actionButtonText}>Image</Text>
              </Pressable>
              <Pressable onPress={() => void handleSendLocation()} style={styles.actionButton}>
                <Text style={styles.actionButtonText}>Location</Text>
              </Pressable>
            </View>
            <View style={styles.composeRow}>
              <TextInput
                value={draft}
                onChangeText={setDraft}
                placeholder={scope === 'GROUP' ? 'Message the whole event…' : 'Private message…'}
                placeholderTextColor="#718096"
                style={styles.composeInput}
                multiline
              />
              <Pressable
                onPress={() => void handleSendText()}
                disabled={sending || !draft.trim() || missingKeys.length > 0}
                style={[styles.sendButton, (sending || !draft.trim() || missingKeys.length > 0) && styles.sendButtonDisabled]}
              >
                <Text style={styles.sendButtonText}>{sending ? '...' : 'Send'}</Text>
              </Pressable>
            </View>
          </View>
        </Animated.View>
      ) : null}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    gap: 14,
  },
  loadingWrap: {
    minHeight: 220,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  loadingText: {
    color: '#d7d7d7',
  },
  emptyState: {
    minHeight: 240,
    borderRadius: 24,
    backgroundColor: 'rgba(15, 23, 42, 0.72)',
    borderWidth: 1,
    borderColor: 'rgba(148, 163, 184, 0.2)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 28,
  },
  emptyTitle: {
    color: '#f8fafc',
    fontSize: 20,
    fontWeight: '700',
  },
  emptyMeta: {
    marginTop: 10,
    color: '#94a3b8',
    textAlign: 'center',
  },
  eventRail: {
    gap: 12,
    paddingRight: 12,
  },
  eventChip: {
    width: 240,
    padding: 16,
    borderRadius: 20,
    backgroundColor: 'rgba(12, 18, 30, 0.76)',
    borderWidth: 1,
    borderColor: 'rgba(148, 163, 184, 0.16)',
  },
  eventChipActive: {
    borderColor: '#f97316',
    backgroundColor: 'rgba(71, 25, 3, 0.9)',
  },
  eventChipTitle: {
    color: '#fff7ed',
    fontSize: 16,
    fontWeight: '700',
  },
  eventChipMeta: {
    marginTop: 6,
    color: '#cbd5e1',
    fontSize: 12,
  },
  threadCard: {
    borderRadius: 28,
    borderWidth: 1,
    borderColor: 'rgba(251, 146, 60, 0.18)',
    backgroundColor: 'rgba(10, 14, 24, 0.9)',
    padding: 18,
    gap: 14,
  },
  threadHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 12,
  },
  threadTitle: {
    color: '#fff7ed',
    fontSize: 20,
    fontWeight: '800',
  },
  threadMeta: {
    marginTop: 4,
    color: '#cbd5e1',
  },
  refreshButton: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 14,
    backgroundColor: '#1e293b',
  },
  refreshButtonText: {
    color: '#f8fafc',
    fontWeight: '700',
  },
  scopeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  scopeButton: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 14,
    backgroundColor: 'rgba(30, 41, 59, 0.72)',
    borderWidth: 1,
    borderColor: 'rgba(148, 163, 184, 0.18)',
  },
  scopeButtonActive: {
    backgroundColor: '#f97316',
    borderColor: '#fdba74',
  },
  scopeText: {
    color: '#fff7ed',
    fontWeight: '700',
  },
  scopePeerWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  scopePeerAvatar: {
    width: 22,
    height: 22,
    borderRadius: 11,
  },
  scopePeerAvatarFallback: {
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#334155',
  },
  scopePeerAvatarText: {
    color: '#e2e8f0',
    fontSize: 11,
    fontWeight: '700',
  },
  pinSection: {
    gap: 10,
  },
  pinSectionTitle: {
    color: '#fdba74',
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  pinCard: {
    width: 240,
    marginRight: 10,
    padding: 14,
    borderRadius: 18,
    backgroundColor: 'rgba(120, 53, 15, 0.78)',
  },
  pinCardMeta: {
    color: '#fed7aa',
    fontSize: 12,
  },
  pinCardText: {
    marginTop: 8,
    color: '#fff7ed',
    fontWeight: '600',
  },
  warningCard: {
    padding: 12,
    borderRadius: 16,
    backgroundColor: 'rgba(127, 29, 29, 0.56)',
    borderWidth: 1,
    borderColor: 'rgba(248, 113, 113, 0.35)',
  },
  warningText: {
    color: '#fecaca',
  },
  messageList: {
    maxHeight: 520,
  },
  messageListContent: {
    gap: 10,
    paddingBottom: 8,
  },
  emptyThread: {
    paddingVertical: 36,
    alignItems: 'center',
  },
  emptyThreadTitle: {
    color: '#f8fafc',
    fontSize: 17,
    fontWeight: '700',
  },
  emptyThreadMeta: {
    marginTop: 8,
    color: '#94a3b8',
    textAlign: 'center',
  },
  messageBubble: {
    maxWidth: '88%',
    padding: 14,
    borderRadius: 18,
    gap: 10,
  },
  messageBubbleMine: {
    alignSelf: 'flex-end',
    backgroundColor: '#431407',
    borderTopRightRadius: 6,
  },
  messageBubbleTheirs: {
    alignSelf: 'flex-start',
    backgroundColor: '#111827',
    borderTopLeftRadius: 6,
  },
  messageTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
  },
  messageSenderWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  messageSenderAvatar: {
    width: 22,
    height: 22,
    borderRadius: 11,
  },
  messageSenderAvatarFallback: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: '#334155',
    alignItems: 'center',
    justifyContent: 'center',
  },
  messageSenderAvatarText: {
    color: '#e2e8f0',
    fontSize: 11,
    fontWeight: '700',
  },
  messageSender: {
    color: '#fdba74',
    fontWeight: '700',
  },
  messageTime: {
    color: '#94a3b8',
    fontSize: 12,
  },
  messageBody: {
    color: '#f8fafc',
    fontSize: 15,
    lineHeight: 21,
  },
  messageBodyMuted: {
    color: '#cbd5e1',
    fontStyle: 'italic',
  },
  messageImage: {
    width: 220,
    height: 180,
    borderRadius: 14,
    backgroundColor: '#1f2937',
  },
  locationCard: {
    padding: 12,
    borderRadius: 14,
    backgroundColor: 'rgba(15, 118, 110, 0.35)',
  },
  locationTitle: {
    color: '#ccfbf1',
    fontWeight: '700',
  },
  locationMeta: {
    marginTop: 6,
    color: '#99f6e4',
  },
  locationLink: {
    marginTop: 8,
    color: '#f0fdfa',
    fontWeight: '700',
  },
  pinToggle: {
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: 'rgba(249, 115, 22, 0.18)',
  },
  pinToggleText: {
    color: '#fdba74',
    fontWeight: '700',
    fontSize: 12,
  },
  pinnedLabel: {
    color: '#fdba74',
    fontSize: 12,
    fontWeight: '700',
  },
  composerCard: {
    gap: 12,
    paddingTop: 4,
  },
  actionRow: {
    flexDirection: 'row',
    gap: 8,
  },
  actionButton: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 14,
    backgroundColor: '#1f2937',
  },
  actionButtonText: {
    color: '#f8fafc',
    fontWeight: '700',
  },
  composeRow: {
    flexDirection: 'row',
    gap: 10,
    alignItems: 'flex-end',
  },
  composeInput: {
    flex: 1,
    minHeight: 52,
    maxHeight: 120,
    borderRadius: 18,
    backgroundColor: '#0f172a',
    borderWidth: 1,
    borderColor: 'rgba(148, 163, 184, 0.18)',
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: '#f8fafc',
  },
  sendButton: {
    paddingHorizontal: 18,
    paddingVertical: 14,
    borderRadius: 16,
    backgroundColor: '#f97316',
  },
  sendButtonDisabled: {
    opacity: 0.45,
  },
  sendButtonText: {
    color: '#fff7ed',
    fontWeight: '800',
  },
});

export default MessagingPanel;
