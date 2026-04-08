import nacl from 'tweetnacl';
import * as util from 'tweetnacl-util';
import type { ChatEncryptedKeyInput, ChatMessage, ChatMessageKind } from './backend';
import { chatApi } from './backend';

type AsyncStorageLike = {
  getItem: (key: string) => Promise<string | null>;
  setItem: (key: string, value: string) => Promise<void>;
};

const memoryStorage = (() => {
  const store = new Map<string, string>();
  return {
    async getItem(key: string) {
      return store.has(key) ? store.get(key) || null : null;
    },
    async setItem(key: string, value: string) {
      store.set(key, value);
    },
  } satisfies AsyncStorageLike;
})();

let asyncStorage: AsyncStorageLike = memoryStorage;
try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const asyncStorageModule = require('@react-native-async-storage/async-storage');
  asyncStorage = (asyncStorageModule?.default || asyncStorageModule) as AsyncStorageLike;
} catch {
  asyncStorage = memoryStorage;
}

const STORAGE_KEY = 'exploreease.chat.identity.v1';

type StoredChatIdentity = {
  publicKey: string;
  secretKey: string;
};

export type ChatPayload =
  | { kind: 'TEXT'; text: string }
  | { kind: 'IMAGE'; imageBase64: string; mimeType?: string | null; width?: number | null; height?: number | null }
  | { kind: 'LOCATION'; latitude: number; longitude: number; label?: string | null };

export type DecryptedChatMessage = {
  id: number;
  eventId: number;
  scope: string;
  kind: ChatMessageKind;
  senderId: number;
  senderName: string;
  senderProfilePictureUrl: string | null;
  recipientId: number | null;
  createdAt: string;
  pinned: boolean;
  pinnedAt: string | null;
  pinnedById: number | null;
  pinnedByName: string | null;
  payload: ChatPayload | null;
  unreadable: boolean;
};

const parseJson = <T>(raw: string | null): T | null => {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
};

const saveIdentity = async (identity: StoredChatIdentity) => {
  await asyncStorage.setItem(STORAGE_KEY, JSON.stringify(identity));
};

export const getOrCreateChatIdentity = async (): Promise<StoredChatIdentity> => {
  const existing = parseJson<StoredChatIdentity>(await asyncStorage.getItem(STORAGE_KEY));
  if (existing?.publicKey && existing?.secretKey) {
    return existing;
  }

  const keyPair = nacl.box.keyPair();
  const identity = {
    publicKey: util.encodeBase64(keyPair.publicKey),
    secretKey: util.encodeBase64(keyPair.secretKey),
  };
  await saveIdentity(identity);
  return identity;
};

export const ensureChatPublicKeyPublished = async (): Promise<StoredChatIdentity> => {
  const identity = await getOrCreateChatIdentity();
  const remoteKey = await chatApi.getMyKey().catch(() => null);
  if (!remoteKey?.publicKey || remoteKey.publicKey !== identity.publicKey) {
    await chatApi.upsertMyKey(identity.publicKey);
  }
  return identity;
};

export const encryptChatPayload = async (
  kind: ChatMessageKind,
  payload: Record<string, unknown>,
  recipients: { userId: number; publicKey: string }[]
): Promise<{
  kind: ChatMessageKind;
  ciphertext: string;
  contentNonce: string;
  encryptedKeys: ChatEncryptedKeyInput[];
}> => {
  const identity = await getOrCreateChatIdentity();
  const senderSecretKey = util.decodeBase64(identity.secretKey);
  const messageKey = nacl.randomBytes(nacl.secretbox.keyLength);
  const contentNonce = nacl.randomBytes(nacl.secretbox.nonceLength);
  const serialized = JSON.stringify({ kind, ...payload });
  const ciphertext = nacl.secretbox(util.decodeUTF8(serialized), contentNonce, messageKey);

  const encryptedKeys = recipients.map((recipient) => {
    const keyNonce = nacl.randomBytes(nacl.box.nonceLength);
    const recipientPublicKey = util.decodeBase64(recipient.publicKey);
    const encryptedKey = nacl.box(messageKey, keyNonce, recipientPublicKey, senderSecretKey);
    return {
      userId: recipient.userId,
      encryptedKey: util.encodeBase64(encryptedKey),
      keyNonce: util.encodeBase64(keyNonce),
    };
  });

  return {
    kind,
    ciphertext: util.encodeBase64(ciphertext),
    contentNonce: util.encodeBase64(contentNonce),
    encryptedKeys,
  };
};

export const decryptChatMessage = async (message: ChatMessage): Promise<DecryptedChatMessage> => {
  try {
    const identity = await getOrCreateChatIdentity();
    if (!message.senderPublicKey) {
      throw new Error('Missing sender public key');
    }

    const sharedMessageKey = nacl.box.open(
      util.decodeBase64(message.encryptedKey),
      util.decodeBase64(message.keyNonce),
      util.decodeBase64(message.senderPublicKey),
      util.decodeBase64(identity.secretKey)
    );

    if (!sharedMessageKey) {
      throw new Error('Cannot decrypt shared message key');
    }

    const plaintext = nacl.secretbox.open(
      util.decodeBase64(message.ciphertext),
      util.decodeBase64(message.contentNonce),
      sharedMessageKey
    );

    if (!plaintext) {
      throw new Error('Cannot decrypt message payload');
    }

    const payload = JSON.parse(util.encodeUTF8(plaintext)) as ChatPayload;
    return {
      id: message.id,
      eventId: message.eventId,
      scope: message.scope,
      kind: message.kind,
      senderId: message.senderId,
      senderName: message.senderName,
      senderProfilePictureUrl: message.senderProfilePictureUrl,
      recipientId: message.recipientId,
      createdAt: message.createdAt,
      pinned: message.pinned,
      pinnedAt: message.pinnedAt,
      pinnedById: message.pinnedById,
      pinnedByName: message.pinnedByName,
      payload,
      unreadable: false,
    };
  } catch {
    return {
      id: message.id,
      eventId: message.eventId,
      scope: message.scope,
      kind: message.kind,
      senderId: message.senderId,
      senderName: message.senderName,
      senderProfilePictureUrl: message.senderProfilePictureUrl,
      recipientId: message.recipientId,
      createdAt: message.createdAt,
      pinned: message.pinned,
      pinnedAt: message.pinnedAt,
      pinnedById: message.pinnedById,
      pinnedByName: message.pinnedByName,
      payload: null,
      unreadable: true,
    };
  }
};
