import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import Animated, { FadeInDown, FadeInUp } from 'react-native-reanimated';
import {
  apiBaseUrl,
  directMessageApi,
  DirectConversation,
  DirectMessageItem,
  sessionStore,
  socialApi,
  UserPublicProfile,
} from '../services/backend';
import {
  getOrCreateChatIdentity,
  encryptChatPayload,
  decryptChatMessage,
  ensureChatPublicKeyPublished,
} from '../services/chatCrypto';

const formatTime = (iso: string | null | undefined) => {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const now = Date.now();
  const diff = now - d.getTime();
  if (diff < 60000) return 'Now';
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h`;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
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

type DmView = 'list' | 'chat' | 'new';

const DirectMessagingPanel = () => {
  const currentUser = sessionStore.get()?.user;
  const [view, setView] = useState<DmView>('list');
  const [loading, setLoading] = useState(false);

  // Conversation list
  const [conversations, setConversations] = useState<DirectConversation[]>([]);
  const [activeConv, setActiveConv] = useState<DirectConversation | null>(null);

  // Messages
  const [messages, setMessages] = useState<DirectMessageItem[]>([]);
  const [messageText, setMessageText] = useState('');

  // New conversation
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<UserPublicProfile[]>([]);

  const loadConversations = useCallback(async () => {
    setLoading(true);
    try {
      const data = await directMessageApi.listConversations();
      setConversations(data || []);
    } catch (err: any) {
      // Silent — empty list is valid
    } finally {
      setLoading(false);
    }
  }, []);

  const loadMessages = useCallback(async (convId: number) => {
    setLoading(true);
    try {
      const data = await directMessageApi.getMessages(convId, 50);
      setMessages(data || []);
    } catch (err: any) {
      Alert.alert('Error', err?.message || 'Cannot load messages');
    } finally {
      setLoading(false);
    }
  }, []);

  const handleOpenConversation = useCallback((conv: DirectConversation) => {
    setActiveConv(conv);
    setView('chat');
    void loadMessages(conv.id);
  }, [loadMessages]);

  const handleSend = useCallback(async () => {
    if (!messageText.trim() || !activeConv) return;
    const text = messageText.trim();
    setMessageText('');

    try {
      const identity = await getOrCreateChatIdentity();
      await ensureChatPublicKeyPublished();

      // Send as plaintext-wrapped in DM format
      // Full E2E encryption would use encryptChatPayload with peer's public key
      let ciphertext = text;
      let contentNonce = 'plain';

      const sent = await directMessageApi.sendMessage(activeConv.id, {
        kind: 'TEXT',
        ciphertext,
        contentNonce,
        encryptedKeys: [],
      });

      setMessages((prev) => [...prev, sent]);
    } catch (err: any) {
      Alert.alert('Error', err?.message || 'Failed to send message');
    }
  }, [messageText, activeConv]);

  const handleNewConversation = useCallback(async (userId: number) => {
    try {
      const conv = await directMessageApi.createConversation(userId);
      setActiveConv(conv);
      setView('chat');
      setMessages([]);
      setConversations((prev) => {
        if (prev.some((c) => c.id === conv.id)) return prev;
        return [conv, ...prev];
      });
    } catch (err: any) {
      Alert.alert('Error', err?.message || 'Cannot start conversation');
    }
  }, []);

  const handleSearch = useCallback(async (q: string) => {
    setSearchQuery(q);
    if (q.trim().length < 2) {
      setSearchResults([]);
      return;
    }
    try {
      const data = await socialApi.searchUsers(q.trim(), 10);
      setSearchResults(data || []);
    } catch {
      // Silent
    }
  }, []);

  useEffect(() => {
    if (view === 'list') {
      void loadConversations();
      const interval = setInterval(loadConversations, 5000);
      return () => clearInterval(interval);
    }
  }, [view, loadConversations]);

  useEffect(() => {
    if (view === 'chat' && activeConv) {
      void loadMessages(activeConv.id);
      const interval = setInterval(() => loadMessages(activeConv.id), 2500);
      return () => clearInterval(interval);
    }
  }, [view, activeConv, loadMessages]);
  // Conversation list view
  const renderConvList = () => (
    <View style={styles.listContainer}>
      <View style={styles.listHeader}>
        <Text style={styles.listTitle}>💬 Messages</Text>
        <Pressable onPress={() => setView('new')} style={styles.newBtn}>
          <Text style={styles.newBtnText}>+ New</Text>
        </Pressable>
      </View>

      {loading && <ActivityIndicator color="#f5f5f5" style={{ padding: 20 }} />}

      {!loading && conversations.length === 0 ? (
        <View style={styles.emptyCard}>
          <Text style={styles.emptyTitle}>No conversations</Text>
          <Text style={styles.emptyMeta}>Tap "+ New" to start a chat</Text>
        </View>
      ) : null}

      {conversations.map((conv, idx) => (
        <Animated.View key={conv.id} entering={FadeInDown.delay(idx * 35).duration(220)}>
          <Pressable
            onPress={() => handleOpenConversation(conv)}
            style={styles.convCard}
          >
            <View style={styles.convAvatar}>
              {resolveAvatarUri(conv.peerProfilePictureUrl) ? (
                <Image source={{ uri: resolveAvatarUri(conv.peerProfilePictureUrl)! }} style={styles.convAvatarImage} />
              ) : (
                <Text style={styles.convAvatarText}>
                  {conv.peerUsername?.charAt(0).toUpperCase() || '?'}
                </Text>
              )}
            </View>
            <View style={styles.convInfo}>
              <Text style={styles.convName}>{conv.peerUsername}</Text>
              <Text style={styles.convTime}>{formatTime(conv.lastMessageAt)}</Text>
            </View>
          </Pressable>
        </Animated.View>
      ))}
    </View>
  );

  // Chat view
  const renderChat = () => (
    <View style={styles.chatContainer}>
      <Pressable onPress={() => setView('list')} style={styles.chatBackBtn}>
        <Text style={styles.chatBackText}>← Back</Text>
        {resolveAvatarUri(activeConv?.peerProfilePictureUrl || null) ? (
          <Image source={{ uri: resolveAvatarUri(activeConv?.peerProfilePictureUrl || null)! }} style={styles.chatHeaderAvatar} />
        ) : null}
        <Text style={styles.chatPeerName}>
          {activeConv?.peerUsername || 'Chat'}
        </Text>
      </Pressable>

      <ScrollView
        style={styles.messagesScroll}
        contentContainerStyle={styles.messagesContent}
      >
        {messages.map((msg, idx) => {
          const isMine = currentUser && msg.senderId === currentUser.id;
          let displayText = msg.ciphertext;

          // Display text — for 'plain' nonce, ciphertext is the actual text
          // For encrypted messages, would use decryptChatMessage
          if (msg.contentNonce === 'plain') {
            displayText = msg.ciphertext;
          }

          return (
            <Animated.View
              key={msg.id}
              entering={FadeInDown.delay(idx * 20).duration(180)}
              style={[styles.msgBubble, isMine ? styles.msgMine : styles.msgTheirs]}
            >
              {!isMine && (
                <Text style={styles.msgSenderName}>{msg.senderName}</Text>
              )}
              <Text style={[styles.msgText, isMine && styles.msgTextMine]}>
                {displayText}
              </Text>
              <Text style={styles.msgTime}>{formatTime(msg.createdAt)}</Text>
            </Animated.View>
          );
        })}

        {messages.length === 0 && !loading && (
          <View style={styles.emptyChatCard}>
            <Text style={styles.emptyChatText}>
              Start the conversation! 🎉
            </Text>
          </View>
        )}
      </ScrollView>

      <View style={styles.inputRow}>
        <TextInput
          value={messageText}
          onChangeText={setMessageText}
          placeholder="Type a message..."
          placeholderTextColor="#666"
          style={styles.chatInput}
          multiline
          maxLength={2000}
        />
        <Pressable
          onPress={handleSend}
          style={[styles.sendBtn, !messageText.trim() && styles.sendBtnDisabled]}
          disabled={!messageText.trim()}
        >
          <Text style={styles.sendBtnText}>Send</Text>
        </Pressable>
      </View>
    </View>
  );

  // New conversation view
  const renderNewConv = () => (
    <View style={styles.newConvContainer}>
      <Pressable onPress={() => setView('list')} style={styles.chatBackBtn}>
        <Text style={styles.chatBackText}>← Cancel</Text>
        <Text style={styles.chatPeerName}>New Message</Text>
      </Pressable>

      <TextInput
        value={searchQuery}
        onChangeText={handleSearch}
        placeholder="Search users to message..."
        placeholderTextColor="#666"
        style={styles.searchInput}
        autoFocus
      />

      {searchResults.map((user, idx) => (
        <Animated.View key={user.id} entering={FadeInDown.delay(idx * 30).duration(200)}>
          <Pressable
            onPress={() => handleNewConversation(user.id)}
            style={styles.searchUserCard}
          >
            <View style={styles.convAvatar}>
              {resolveAvatarUri(user.profilePictureUrl) ? (
                <Image source={{ uri: resolveAvatarUri(user.profilePictureUrl)! }} style={styles.convAvatarImage} />
              ) : (
                <Text style={styles.convAvatarText}>
                  {user.username?.charAt(0).toUpperCase() || '?'}
                </Text>
              )}
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.convName}>{user.username}</Text>
              {user.bio ? <Text style={styles.searchBio} numberOfLines={1}>{user.bio}</Text> : null}
            </View>
            <Text style={styles.messageAction}>Message →</Text>
          </Pressable>
        </Animated.View>
      ))}

      {searchQuery.trim().length >= 2 && searchResults.length === 0 && (
        <Text style={styles.noResultsText}>No users found</Text>
      )}
    </View>
  );

  return (
    <View style={styles.container}>
      {view === 'list' && renderConvList()}
      {view === 'chat' && renderChat()}
      {view === 'new' && renderNewConv()}
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1 },
  listContainer: { gap: 10 },
  listHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    marginBottom: 4,
  },
  listTitle: { color: '#f2f2f2', fontSize: 20, fontWeight: '800' },
  newBtn: {
    paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20,
    backgroundColor: '#f5f5f5',
  },
  newBtnText: { color: '#0b0b0b', fontSize: 13, fontWeight: '700' },
  convCard: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    padding: 14, borderRadius: 14, backgroundColor: '#131313',
    borderWidth: 1, borderColor: '#262626',
  },
  convAvatar: {
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: '#2a2a2a', alignItems: 'center', justifyContent: 'center', overflow: 'hidden',
  },
  convAvatarImage: {
    width: '100%',
    height: '100%',
  },
  convAvatarText: { color: '#f5f5f5', fontSize: 18, fontWeight: '700' },
  convInfo: { flex: 1, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  convName: { color: '#f2f2f2', fontSize: 15, fontWeight: '700' },
  convTime: { color: '#777', fontSize: 12 },
  emptyCard: {
    padding: 32, borderRadius: 16, backgroundColor: '#111',
    borderWidth: 1, borderColor: '#2a2a2a', alignItems: 'center', gap: 8,
  },
  emptyTitle: { color: '#f2f2f2', fontSize: 17, fontWeight: '700' },
  emptyMeta: { color: '#888', fontSize: 13, textAlign: 'center' },
  chatContainer: { flex: 1, gap: 10 },
  chatBackBtn: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 4 },
  chatBackText: { color: '#888', fontSize: 14 },
  chatHeaderAvatar: { width: 24, height: 24, borderRadius: 12 },
  chatPeerName: { color: '#f2f2f2', fontSize: 16, fontWeight: '700' },
  messagesScroll: { flex: 1 },
  messagesContent: { gap: 8, paddingVertical: 8 },
  msgBubble: {
    maxWidth: '80%', padding: 12, borderRadius: 16, gap: 4,
  },
  msgMine: {
    alignSelf: 'flex-end', backgroundColor: '#f5f5f5',
    borderBottomRightRadius: 4,
  },
  msgTheirs: {
    alignSelf: 'flex-start', backgroundColor: '#1e1e1e',
    borderBottomLeftRadius: 4, borderWidth: 1, borderColor: '#2a2a2a',
  },
  msgSenderName: { color: '#888', fontSize: 11, fontWeight: '600' },
  msgText: { color: '#d0d0d0', fontSize: 14, lineHeight: 20 },
  msgTextMine: { color: '#0b0b0b' },
  msgTime: { color: '#777', fontSize: 10, textAlign: 'right' },
  emptyChatCard: { alignItems: 'center', padding: 40 },
  emptyChatText: { color: '#888', fontSize: 15 },
  inputRow: {
    flexDirection: 'row', gap: 8, alignItems: 'flex-end',
    borderTopWidth: 1, borderTopColor: '#262626', paddingTop: 10,
  },
  chatInput: {
    flex: 1, borderRadius: 14, borderWidth: 1, borderColor: '#333',
    backgroundColor: '#171717', color: '#f2f2f2',
    paddingHorizontal: 14, paddingVertical: 10, fontSize: 14,
    maxHeight: 100,
  },
  sendBtn: {
    paddingHorizontal: 18, paddingVertical: 12, borderRadius: 14,
    backgroundColor: '#f5f5f5',
  },
  sendBtnDisabled: { opacity: 0.4 },
  sendBtnText: { color: '#0b0b0b', fontSize: 14, fontWeight: '700' },
  newConvContainer: { gap: 12 },
  searchInput: {
    borderRadius: 14, borderWidth: 1, borderColor: '#333',
    backgroundColor: '#171717', color: '#f2f2f2',
    paddingHorizontal: 14, paddingVertical: 12, fontSize: 14,
  },
  searchUserCard: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    padding: 12, borderRadius: 14, backgroundColor: '#131313',
    borderWidth: 1, borderColor: '#262626',
  },
  searchBio: { color: '#888', fontSize: 12 },
  messageAction: { color: '#f5f5f5', fontSize: 12, fontWeight: '700' },
  noResultsText: { color: '#777', textAlign: 'center', paddingVertical: 16 },
});

export default DirectMessagingPanel;
