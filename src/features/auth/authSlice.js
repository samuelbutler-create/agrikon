import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import api from '../../services/api';

// Helper function to validate JWT token
const isTokenValid = (token) => {
  if (!token) return false;
  
  try {
    // Decode JWT token
    const payload = JSON.parse(atob(token.split('.')[1]));
    
    // Check if token is expired
    if (payload.exp && payload.exp * 1000 < Date.now()) {
      console.log('Token expired');
      return false;
    }
    
    return true;
  } catch (error) {
    console.error('Invalid token format:', error);
    return false;
  }
};

// Helper function to get initial auth state
const getInitialAuthState = () => {
  const token = localStorage.getItem('token');
  const userStr = localStorage.getItem('user');
  
  // Validate token
  if (token && isTokenValid(token) && userStr) {
    try {
      const user = JSON.parse(userStr);
      return { token, user };
    } catch (error) {
      console.error('Invalid user data in localStorage');
    }
  }
  
  // Clear invalid data
  localStorage.removeItem('token');
  localStorage.removeItem('user');
  return { token: null, user: null };
};

// Async thunks
export const login = createAsyncThunk(
  'auth/login',
  async ({ email, password }, { rejectWithValue }) => {
    try {
      const response = await api.post('/auth/login', { email, password });
      const { token, user } = response.data;
      
      // Store both token and user
      localStorage.setItem('token', token);
      localStorage.setItem('user', JSON.stringify(user));
      
      return { user, token };
    } catch (error) {
      // Clear any stale data on login failure
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      return rejectWithValue(error.response?.data || { message: 'Login failed' });
    }
  }
);

export const register = createAsyncThunk(
  'auth/register',
  async (userData, { rejectWithValue }) => {
    try {
      // Map userType to role for backend compatibility
      const roleMapping = {
        farmer: 'farmer',
        expert: 'expert',
        vendor: 'farmer',
        enthusiast: 'farmer'
      };

      const apiData = {
        email: userData.email,
        password: userData.password,
        first_name: userData.firstName,
        last_name: userData.lastName,
        role: roleMapping[userData.userType] || 'farmer',
        specialties: userData.specialties
      };

      const response = await api.post('/auth/register', apiData);
      const { token, user } = response.data;
      
      // Store both token and user
      localStorage.setItem('token', token);
      localStorage.setItem('user', JSON.stringify(user));
      
      return { user, token };
    } catch (error) {
      // Clear any stale data on registration failure
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      return rejectWithValue(error.response?.data || { message: 'Registration failed' });
    }
  }
);

const initialAuthState = getInitialAuthState();

const authSlice = createSlice({
  name: 'auth',
  initialState: {
    user: initialAuthState.user,
    token: initialAuthState.token,
    isLoading: false,
    error: null,
  },
  reducers: {
    logout: (state) => {
      state.user = null;
      state.token = null;
      state.error = null;
      localStorage.removeItem('token');
      localStorage.removeItem('user');
    },
    clearError: (state) => {
      state.error = null;
    },
  },
  extraReducers: (builder) => {
    builder
      // Login cases
      .addCase(login.pending, (state) => {
        state.isLoading = true;
        state.error = null;
      })
      .addCase(login.fulfilled, (state, action) => {
        state.isLoading = false;
        state.user = action.payload.user;
        state.token = action.payload.token;
        state.error = null;
      })
      .addCase(login.rejected, (state, action) => {
        state.isLoading = false;
        state.error = action.payload;
        state.user = null;
        state.token = null;
      })
      // Register cases
      .addCase(register.pending, (state) => {
        state.isLoading = true;
        state.error = null;
      })
      .addCase(register.fulfilled, (state, action) => {
        state.isLoading = false;
        state.user = action.payload.user;
        state.token = action.payload.token;
        state.error = null;
      })
      .addCase(register.rejected, (state, action) => {
        state.isLoading = false;
        state.error = action.payload;
        state.user = null;
        state.token = null;
      });
  },
});

export const { logout, clearError } = authSlice.actions;
export default authSlice.reducer;