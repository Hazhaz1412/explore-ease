import { authApi } from './backend';

export const authService = {
  login: async (email: string, password: string) => authApi.login({ email, password }),
  register: async (email: string, password: string, username?: string) =>
    authApi.register({ email, password, username }),
  verifyOtp: async (email: string, otp: string) => authApi.verifyOtp({ email, otp }),
  resendVerificationOtp: async (email: string) => authApi.resendVerificationOtp(email),
  forgotPassword: async (email: string) => authApi.forgotPassword(email),
  resetPassword: async (email: string, otp: string, newPassword: string) =>
    authApi.resetPassword({ email, otp, newPassword }),
  logout: async () => authApi.logout(),
  loginWithGoogle: async (idToken: string) => authApi.loginWithGoogle(idToken),
};
