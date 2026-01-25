// services/authService.ts

const API_URL = process.env.EXPO_PUBLIC_API_URL;

interface AuthResponse {
  success: boolean;
  token?: string;
  user?: any;
  message?: string;
}

export const authService = {
  login: async (email: string, password: string): Promise<AuthResponse> => {
    try {
      const response = await fetch(`${API_URL}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      const data = await response.json();
      return data;
    } catch (error) {
      return { success: false, message: 'Network error or server unavailable' };
    }
  },

  register: async (email: string, password: string, name: string): Promise<AuthResponse> => {
    try {
      const response = await fetch(`${API_URL}/api/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, name }),
      });
      const data = await response.json();
      return data;
    } catch (error) {
      return { success: false, message: 'Network error or server unavailable' };
    }
  },
};