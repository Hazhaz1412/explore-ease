// screens/auth.tsx
import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Alert,
  Dimensions
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Animated, { 
  FadeInDown, 
  FadeOutUp, 
  Layout, 
  useSharedValue, 
  useAnimatedStyle, 
  withSpring 
} from 'react-native-reanimated';
import { authService } from '../services/authService';

// Lấy chiều rộng màn hình để căn chỉnh
const { width } = Dimensions.get('window');

const AuthScreen = ({ navigation }: any) => {
  const [isLogin, setIsLogin] = useState(true);
  const [loading, setLoading] = useState(false);
  
  // Form State
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');

  // Animation Toggle
  const toggleAuthMode = () => {
    setIsLogin(!isLogin);
    // Reset form khi chuyển chế độ nếu muốn
  };

  const handleSubmit = async () => {
    // Basic Validation
    if (!email || !password || (!isLogin && !name)) {
      Alert.alert('Missing Info', 'Please fill in all fields.');
      return;
    }

    setLoading(true);
    let result;

    if (isLogin) {
      result = await authService.login(email, password);
    } else {
      result = await authService.register(email, password, name);
    }

    setLoading(false);

    if (result.success || result.token) {
      // Giả sử API trả về success hoặc token
      // TODO: Lưu token vào SecureStore hoặc AsyncStorage tại đây
      Alert.alert('Success', isLogin ? 'Welcome back!' : 'Account created!');
      
      // Navigate vào trong App chính
      // navigation.replace('Home'); 
    } else {
      Alert.alert('Error', result.message || 'Authentication failed');
    }
  };

  return (
    <View style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.keyboardView}
        >
          {/* HEADER SECTION */}
          <View style={styles.header}>
            <Animated.Text 
              key={isLogin ? 'login-title' : 'reg-title'}
              entering={FadeInDown.duration(600).springify()}
              style={styles.title}
            >
              {isLogin ? 'Welcome\nBack.' : 'Create\nAccount.'}
            </Animated.Text>
          </View>

          {/* FORM SECTION */}
          <View style={styles.formContainer}>
            
            {/* Input Name - Chỉ hiện khi đăng ký */}
            {!isLogin && (
              <Animated.View 
                entering={FadeInDown.delay(100).duration(400)} 
                exiting={FadeOutUp.duration(200)}
                layout={Layout.springify()}
              >
                <TextInput
                  style={styles.input}
                  placeholder="Full Name"
                  placeholderTextColor="#666"
                  value={name}
                  onChangeText={setName}
                  autoCapitalize="words"
                />
              </Animated.View>
            )}

            <Animated.View layout={Layout.springify()}>
              <TextInput
                style={styles.input}
                placeholder="Email Address"
                placeholderTextColor="#666"
                value={email}
                onChangeText={setEmail}
                keyboardType="email-address"
                autoCapitalize="none"
              />
            </Animated.View>

            <Animated.View layout={Layout.springify()}>
              <TextInput
                style={styles.input}
                placeholder="Password"
                placeholderTextColor="#666"
                value={password}
                onChangeText={setPassword}
                secureTextEntry
              />
            </Animated.View>

            {/* Submit Button */}
            <TouchableOpacity 
              activeOpacity={0.8} 
              onPress={handleSubmit} 
              disabled={loading}
              style={styles.button}
            >
              {loading ? (
                <ActivityIndicator color="#000" />
              ) : (
                <Text style={styles.buttonText}>
                  {isLogin ? 'Sign In' : 'Sign Up'}
                </Text>
              )}
            </TouchableOpacity>

            {/* Toggle Mode */}
            <View style={styles.footer}>
              <Text style={styles.footerText}>
                {isLogin ? "Don't have an account? " : "Already have an account? "}
              </Text>
              <TouchableOpacity onPress={toggleAuthMode}>
                <Text style={styles.footerLink}>
                  {isLogin ? 'Register' : 'Login'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000000', // Màu nền đen chủ đạo
  },
  safeArea: {
    flex: 1,
  },
  keyboardView: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  header: {
    marginBottom: 40,
  },
  title: {
    fontSize: 42,
    fontWeight: '800',
    color: '#FFFFFF', // Chữ trắng
    letterSpacing: 1,
    lineHeight: 50,
  },
  formContainer: {
    gap: 16, // Khoảng cách giữa các input
  },
  input: {
    backgroundColor: '#1A1A1A', // Màu nền input hơi sáng hơn nền chính
    borderWidth: 1,
    borderColor: '#333333',
    color: '#FFFFFF',
    padding: 18,
    borderRadius: 12,
    fontSize: 16,
  },
  button: {
    backgroundColor: '#FFFFFF', // Nút trắng nổi bật
    paddingVertical: 18,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 10,
    shadowColor: '#FFF',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 10,
    elevation: 5,
  },
  buttonText: {
    color: '#000000',
    fontSize: 16,
    fontWeight: 'bold',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginTop: 24,
  },
  footerText: {
    color: '#888',
    fontSize: 14,
  },
  footerLink: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: 'bold',
    textDecorationLine: 'underline',
  },
});

export default AuthScreen;