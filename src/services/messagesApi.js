const API_URL = import.meta.env.VITE_API_URL?.replace('/api/v1', '') || "http://localhost:5000";

const getAuthHeaders = () => {
  const token = localStorage.getItem("token");
  const isValidToken = (value) => {
    if (!value || typeof value !== 'string') return false;
    const trimmed = value.trim();
    if (!trimmed || trimmed === 'null' || trimmed === 'undefined') return false;
    const parts = trimmed.split('.');
    return parts.length === 3 && parts.every((part) => part.length > 0);
  };
  return {
    "Content-Type": "application/json",
    ...(isValidToken(token) && { "Authorization": `Bearer ${token}` }),
  };
};

export async function fetchInbox() {
  try {
    const res = await fetch(`${API_URL}/messages/inbox`, {
      headers: getAuthHeaders(),
    });
    if (!res.ok) throw new Error('Failed to fetch inbox');
    return res.json();
  } catch (error) {
    console.error('Inbox fetch error:', error);
    throw error;
  }
}

export async function fetchConversation(userId) {
  try {
    const res = await fetch(`${API_URL}/messages/${userId}`, {
      headers: getAuthHeaders(),
    });
    if (!res.ok) throw new Error('Failed to fetch conversation');
    return res.json();
  } catch (error) {
    console.error('Conversation fetch error:', error);
    throw error;
  }
}

export async function sendMessage(receiverId, content) {
  try {
    const res = await fetch(`${API_URL}/messages`, {
      method: "POST",
      headers: getAuthHeaders(),
      body: JSON.stringify({
        receiver_id: receiverId,
        content,
      }),
    });
    if (!res.ok) throw new Error('Failed to send message');
    return res.json();
  } catch (error) {
    console.error('Send message error:', error);
    throw error;
  }
}

export async function searchUsers(query, userType = 'all') {
  try {
    const params = new URLSearchParams({ q: query });
    if (userType !== 'all') params.append('type', userType);
    
    const url = `${API_URL}/users/search?${params}`;
    console.log('🔍 Searching users at:', url);
    console.log('🔍 Query:', query, 'Type:', userType);
    
    const res = await fetch(url, {
      headers: getAuthHeaders(),
    });
    
    console.log('🔍 Response status:', res.status);
    console.log('🔍 Response ok:', res.ok);
    
    if (!res.ok) {
      const errorText = await res.text();
      console.error('❌ Search failed:', res.status, errorText);
      
      // If endpoint doesn't exist (404), show helpful message
      if (res.status === 404) {
        console.error('❌ Endpoint /users/search does not exist on backend');
        console.error('📝 Backend needs to implement: GET /api/v1/users/search');
      }
      
      return [];
    }
    
    const data = await res.json();
    console.log('✅ Search results:', data);
    console.log('✅ Number of results:', Array.isArray(data) ? data.length : 'Not an array');
    
    return Array.isArray(data) ? data : [];
  } catch (error) {
    console.error('❌ Search users error:', error.message);
    console.error('❌ Full error:', error);
    return [];
  }
}

export async function fetchAllUsers(userType = 'all') {
  try {
    const params = new URLSearchParams();
    if (userType !== 'all') params.append('type', userType);
    
    const url = `${API_URL}/users${params.toString() ? '?' + params : ''}`;
    console.log('👥 Fetching all users:', url);
    
    const res = await fetch(url, {
      headers: getAuthHeaders(),
    });
    
    if (!res.ok) {
      console.error('❌ Failed to fetch users:', res.status);
      return [];
    }
    
    const data = await res.json();
    console.log('✅ All users:', data);
    return Array.isArray(data) ? data : [];
  } catch (error) {
    console.error('❌ Fetch all users error:', error);
    return [];
  }
}
