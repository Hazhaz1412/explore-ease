import React, { useEffect, useRef, useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { Mic, MicOff, X, Clock } from 'lucide-react-native';

export interface VoiceSearchResult {
  transcript: string;
  isFinal: boolean;
}

export interface VoiceSearchProps {
  onSearchChange: (transcript: string, isFinal: boolean) => void;
  onClose?: () => void;
  placeholder?: string;
}

// Web-only: Get local storage
const getWebLocalStorage = (key: string, defaultValue: string[] = []) => {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return defaultValue;
  try {
    const item = window.localStorage.getItem(key);
    return item ? JSON.parse(item) : defaultValue;
  } catch {
    return defaultValue;
  }
};

// Web-only: Set local storage
const setWebLocalStorage = (key: string, value: string[]) => {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Storage quota exceeded or unavailable
  }
};

const mapSpeechError = (errorCode: string) => {
  if (errorCode === 'no-speech') {
    return 'Không phát hiện giọng nói. Vui lòng thử lại.';
  }
  if (errorCode === 'not-allowed' || errorCode === 'service-not-allowed') {
    return 'Trình duyệt đang chặn microphone. Hãy cấp quyền mic cho localhost:8081 rồi thử lại.';
  }
  if (errorCode === 'network') {
    return 'Speech recognition bị lỗi mạng. Với Brave, hãy tắt Shields cho localhost hoặc dùng Chrome/Edge rồi thử lại.';
  }
  if (errorCode === 'audio-capture') {
    return 'Không truy cập được microphone. Kiểm tra mic có đang được hệ thống nhận diện không.';
  }
  return `Speech recognition error: ${errorCode}`;
};

const VoiceSearch: React.FC<VoiceSearchProps> = ({
  onSearchChange,
  onClose,
  placeholder = 'Listening...',
}) => {
  const [isListening, setIsListening] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [interimTranscript, setInterimTranscript] = useState('');
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [error, setError] = useState('');
  const [voiceHistory, setVoiceHistory] = useState<string[]>([]);
  const recognitionRef = useRef<any>(null);
  const [isSupported, setIsSupported] = useState(false);
  const isWeb = Platform.OS === 'web';
  const transcriptRef = useRef('');
  const voiceHistoryRef = useRef<string[]>([]);
  const onSearchChangeRef = useRef(onSearchChange);

  useEffect(() => {
    transcriptRef.current = transcript;
  }, [transcript]);

  useEffect(() => {
    voiceHistoryRef.current = voiceHistory;
  }, [voiceHistory]);

  useEffect(() => {
    onSearchChangeRef.current = onSearchChange;
  }, [onSearchChange]);

  // Load voice search history on mount (web only)
  useEffect(() => {
    if (Platform.OS === 'web') {
      const history = getWebLocalStorage('voiceSearchHistory', []);
      setVoiceHistory(history);
    }
  }, []);

  useEffect(() => {
    // Check if Web Speech API is supported
    if (isWeb && typeof window !== 'undefined') {
      const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      if (SpeechRecognition) {
        setIsSupported(true);
        recognitionRef.current = new SpeechRecognition();

        const recognition = recognitionRef.current;
        recognition.continuous = true;
        recognition.interimResults = true;
        recognition.lang = 'en-US';

        recognition.onstart = () => {
          setIsListening(true);
          setError('');
          setTranscript('');
          setInterimTranscript('');
        };

        recognition.onresult = (event: any) => {
          let interim = '';
          let final = '';

          for (let i = event.resultIndex; i < event.results.length; i++) {
            const text = event.results[i][0].transcript;
            if (event.results[i].isFinal) {
              final += text + ' ';
            } else {
              interim += text;
            }
          }

          setInterimTranscript(interim);
          if (final) {
            setTranscript((prev) => {
              const merged = `${prev} ${final}`.trim();
              onSearchChangeRef.current(merged, true);
              if (isWeb) {
                const newHistory = [merged, ...voiceHistoryRef.current.filter((h) => h !== merged)].slice(0, 8);
                setVoiceHistory(newHistory);
                setWebLocalStorage('voiceSearchHistory', newHistory);
              }
              return merged;
            });
            generateSuggestions(final.trim());
          } else if (interim) {
            onSearchChangeRef.current(`${transcriptRef.current} ${interim}`.trim(), false);
          }
        };

        recognition.onerror = (event: any) => {
          setError(mapSpeechError(event?.error || 'unknown'));
        };

        recognition.onend = () => {
          setIsListening(false);
        };
      } else {
        setIsSupported(false);
      }
    }

    return () => {
      if (recognitionRef.current && isListening) {
        recognitionRef.current.stop();
      }
    };
  }, [isWeb]);

  const generateSuggestions = (text: string) => {
    // Simple suggestion logic based on common search terms
    const commonTerms = [
      'coffee shop',
      'restaurant',
      'museum',
      'park',
      'hotel',
      'beach',
      'mountain',
      'hiking trail',
      'shopping mall',
      'temple',
      'garden',
      'market',
      'bar',
      'cafe',
    ];

    const matching = commonTerms
      .filter((term) => term.toLowerCase().includes(text.toLowerCase()))
      .slice(0, 3);

    setSuggestions(matching);
  };

  const startListening = () => {
    if (!recognitionRef.current || !isSupported) {
      return;
    }

    const run = async () => {
      try {
        if (isWeb && typeof navigator !== 'undefined' && navigator.mediaDevices?.getUserMedia) {
          await navigator.mediaDevices.getUserMedia({ audio: true });
        }
        recognitionRef.current.start();
      } catch (e: any) {
        const message = e?.name === 'NotAllowedError'
          ? 'Bạn chưa cấp quyền microphone cho trình duyệt.'
          : e?.message || 'Không thể khởi động voice search.';
        setError(message);
      }
    };

    void run();
  };

  const stopListening = () => {
    if (recognitionRef.current) {
      recognitionRef.current.stop();
    }
  };

  const handleSuggestionPress = (suggestion: string) => {
    setTranscript(suggestion);
    onSearchChange(suggestion, true);
    // Save to history (web only)
    if (isWeb) {
      const newHistory = [suggestion, ...voiceHistory.filter((h) => h !== suggestion)].slice(0, 8);
      setVoiceHistory(newHistory);
      setWebLocalStorage('voiceSearchHistory', newHistory);
    }
    stopListening();
  };

  const handleClear = () => {
    setTranscript('');
    setInterimTranscript('');
    setSuggestions([]);
    setError('');
    onSearchChange('', true);
  };

  const handleHistoryPress = (item: string) => {
    setTranscript(item);
    onSearchChange(item, true);
    stopListening();
  };

  if (!isWeb || !isSupported) {
    return (
      <View style={styles.wrapper}>
        <View style={styles.header}>
          <Text style={styles.title}>Voice Search</Text>
          {onClose && (
            <Pressable onPress={onClose} style={styles.closeBtn}>
              <X size={20} color="#94a3b8" strokeWidth={2} />
            </Pressable>
          )}
        </View>
        <View style={styles.unsupportedBox}>
          <Text style={styles.unsupportedText}>
            {isWeb
              ? 'Browser này chưa hỗ trợ Speech Recognition. Hãy dùng Chrome hoặc Edge để dùng Voice Search.'
              : 'Voice Search hiện chỉ hỗ trợ trên web browser.'}
          </Text>
        </View>
      </View>
    );
  }

  const displayText = interimTranscript 
    ? `${transcript} ${interimTranscript}`
    : transcript;

  return (
    <View style={styles.wrapper}>
      <View style={styles.header}>
        <Text style={styles.title}>Voice Search</Text>
        {onClose && (
          <Pressable onPress={onClose} style={styles.closeBtn}>
            <X size={20} color="#94a3b8" strokeWidth={2} />
          </Pressable>
        )}
      </View>

      <View style={styles.inputContainer}>
        <View style={styles.micRow}>
          <Pressable
            style={[styles.micButton, isListening && styles.micButtonActive]}
            onPress={isListening ? stopListening : startListening}
          >
            {isListening ? (
              <Mic size={24} color="#0f172a" strokeWidth={2} />
            ) : (
              <MicOff size={24} color="#cbd5e1" strokeWidth={2} />
            )}
          </Pressable>
          <Text style={[styles.statusText, isListening && styles.statusTextActive]}>
            {isListening ? 'Listening...' : 'Click to start'}
          </Text>
        </View>

        {displayText && (
          <View style={styles.transcriptBox}>
            <Text style={styles.transcriptText}>{displayText}</Text>
            {interimTranscript && (
              <Text style={styles.interimText}>{interimTranscript}</Text>
            )}
          </View>
        )}

        {error && (
          <View style={styles.errorBox}>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        )}
      </View>

      {suggestions.length > 0 && (
        <View style={styles.suggestionsContainer}>
          <Text style={styles.suggestionsTitle}>Suggestions</Text>
          <View style={styles.suggestionsList}>
            {suggestions.map((suggestion, idx) => (
              <Pressable
                key={idx}
                style={styles.suggestionItem}
                onPress={() => handleSuggestionPress(suggestion)}
              >
                <Text style={styles.suggestionText}>{suggestion}</Text>
              </Pressable>
            ))}
          </View>
        </View>
      )}

      {voiceHistory.length > 0 && !displayText && !isListening && (
        <View style={styles.historyContainer}>
          <View style={styles.historyHeader}>
            <Clock size={14} color="#cbd5e1" />
            <Text style={styles.historyTitle}>Recent Searches</Text>
          </View>
          <View style={styles.historyList}>
            {voiceHistory.map((item, idx) => (
              <Pressable
                key={idx}
                style={styles.historyItem}
                onPress={() => handleHistoryPress(item)}
              >
                <Text style={styles.historyText}>{item}</Text>
              </Pressable>
            ))}
          </View>
        </View>
      )}

      {displayText && (
        <Pressable style={styles.clearButton} onPress={handleClear}>
          <Text style={styles.clearButtonText}>Clear</Text>
        </Pressable>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  wrapper: {
    backgroundColor: 'rgba(17, 24, 39, 0.95)',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
    padding: 16,
    gap: 12,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  title: {
    color: '#f8fafc',
    fontSize: 18,
    fontWeight: '800',
  },
  closeBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.05)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  inputContainer: {
    gap: 12,
  },
  micRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  micButton: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: 'rgba(255,255,255,0.1)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.2)',
  },
  micButtonActive: {
    backgroundColor: '#00f2fe',
    borderColor: '#00d4ff',
  },
  statusText: {
    color: '#94a3b8',
    fontSize: 14,
    fontWeight: '600',
    flex: 1,
  },
  statusTextActive: {
    color: '#00f2fe',
    fontWeight: '700',
  },
  transcriptBox: {
    backgroundColor: 'rgba(0, 242, 254, 0.08)',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(0, 242, 254, 0.2)',
    padding: 12,
  },
  transcriptText: {
    color: '#f8fafc',
    fontSize: 14,
    fontWeight: '600',
    lineHeight: 20,
  },
  interimText: {
    color: '#7dd3fc',
    fontSize: 14,
    fontStyle: 'italic',
    marginTop: 4,
  },
  errorBox: {
    backgroundColor: 'rgba(239, 68, 68, 0.1)',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.3)',
    padding: 12,
  },
  errorText: {
    color: '#fca5a5',
    fontSize: 13,
    fontWeight: '600',
  },
  suggestionsContainer: {
    gap: 8,
  },
  suggestionsTitle: {
    color: '#cbd5e1',
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  suggestionsList: {
    gap: 8,
  },
  suggestionItem: {
    backgroundColor: 'rgba(0, 242, 254, 0.15)',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: 'rgba(0, 242, 254, 0.3)',
  },
  suggestionText: {
    color: '#7dd3fc',
    fontSize: 13,
    fontWeight: '600',
  },
  clearButton: {
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
  },
  clearButtonText: {
    color: '#e2e8f0',
    fontSize: 13,
    fontWeight: '700',
  },
  historyContainer: {
    gap: 8,
  },
  historyHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  historyTitle: {
    color: '#cbd5e1',
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  historyList: {
    gap: 6,
  },
  historyItem: {
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
  },
  historyText: {
    color: '#cbd5e1',
    fontSize: 12,
    fontWeight: '500',
  },
  unsupportedBox: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
    backgroundColor: 'rgba(255,255,255,0.05)',
    padding: 12,
  },
  unsupportedText: {
    color: '#cbd5e1',
    fontSize: 13,
    lineHeight: 18,
  },
});

export default VoiceSearch;
