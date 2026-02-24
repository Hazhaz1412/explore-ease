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
  Dimensions,
  Image
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Animated, { 
  FadeInDown, 
  FadeOutUp, 
  Layout, 
  FadeIn,
  FadeOut
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
  };

  const handleForgotPassword = () => {
    // TODO: Navigate to ForgotPassword Screen or show Modal
    Alert.alert('Reset Password', 'Link to reset password has been sent to your email.');
  };

  const handleGoogleLogin = async () => {
    // TODO: Integrate Google Sign-In logic here
    // Example: await GoogleSignin.signIn();
    Alert.alert('Google Login', 'Google Sign-In logic goes here.');
  };

  const handleSubmit = async () => {
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
      Alert.alert('Success', isLogin ? 'Welcome back!' : 'Account created!');
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

            {/* Forgot Password - Chỉ hiện khi đăng nhập */}
            {isLogin && (
              <Animated.View 
                entering={FadeIn.duration(300)} 
                exiting={FadeOut.duration(200)}
                layout={Layout.springify()}
                style={styles.forgotPassContainer}
              >
                <TouchableOpacity onPress={handleForgotPassword}>
                  <Text style={styles.forgotPassText}>Forgot Password?</Text>
                </TouchableOpacity>
              </Animated.View>
            )}

            {/* Submit Button */}
            <Animated.View layout={Layout.springify()}>
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
            </Animated.View>

            {/* DIVIDER & GOOGLE LOGIN */}
            <Animated.View layout={Layout.springify()} style={{ marginTop: 10 }}>
              <View style={styles.dividerContainer}>
                <View style={styles.dividerLine} />
                <Text style={styles.dividerText}>OR</Text>
                <View style={styles.dividerLine} />
              </View>

              <TouchableOpacity 
                style={styles.googleButton} 
                onPress={handleGoogleLogin}
                activeOpacity={0.8}
              >
                {/* Nếu bạn có thư viện icon, thay Text 'G' bằng <AntDesign name="google" size={20} color="white" /> */}
                <View style={styles.googleIconPlaceholder}>
                  <Text style={styles.googleIconText}>G</Text>
                </View>
                <Text style={styles.googleButtonText}>Continue with Google</Text>
              </TouchableOpacity>
            </Animated.View>

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
    backgroundColor: '#000000',
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
    marginBottom: 30,
  },
  title: {
    fontSize: 42,
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: 1,
    lineHeight: 50,
  },
  formContainer: {
    gap: 16,
  },
  input: {
    backgroundColor: '#1A1A1A',
    borderWidth: 1,
    borderColor: '#333333',
    color: '#FFFFFF',
    padding: 18,
    borderRadius: 12,
    fontSize: 16,
  },
  // --- Forgot Password Styles ---
  forgotPassContainer: {
    alignItems: 'flex-end',
    marginTop: -8, // Kéo gần lại input password một chút
  },
  forgotPassText: {
    color: '#AAAAAA',
    fontWeight: '600',
    fontSize: 14,
  },
  // --- Main Button ---
  button: {
    backgroundColor: '#FFFFFF',
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
  // --- Divider Styles ---
  dividerContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 20,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: '#333333',
  },
  dividerText: {
    color: '#666666',
    paddingHorizontal: 16,
    fontSize: 14,
    fontWeight: '600',
  },
  // --- Google Button Styles ---
  googleButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#1A1A1A',
    borderWidth: 1,
    borderColor: '#333333',
    paddingVertical: 16,
    borderRadius: 12,
    marginBottom: 10,
  },
  googleIconPlaceholder: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  googleIconText: {
    color: '#000',
    fontWeight: 'bold',
    fontSize: 16,
  },
  googleButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  // --- Footer ---
  footer: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginTop: 16,
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