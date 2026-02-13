import { useEffect, useState, useRef } from "react";
import { useSelector } from 'react-redux';
import { fetchConversation, sendMessage } from "../../services/messagesApi";
import MessageBubble from "./MessageBubble";

export default function ChatView({ userId }) {
  const [messages, setMessages] = useState([]);
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [sending, setSending] = useState(false);
  const messagesRef = useRef(null);
  const typingTimerRef = useRef(null);

  const currentUserId = useSelector(state => state.auth.user?.id);
  const currentUserName = useSelector(state => state.auth.user ? `${state.auth.user.first_name} ${state.auth.user.last_name}` : null);

  useEffect(() => {
    if (!userId) return;

    setLoading(true);
    let isMounted = true;

    const loadMessages = async () => {
      try {
        const data = await fetchConversation(userId);
          if (isMounted) {
            // normalize messages to ensure boolean isOwn
            const normalized = (data || []).map(m => ({
              ...m,
              is_own: Boolean(m.is_own) || (m.sender_id && currentUserId && m.sender_id === currentUserId) || (m.sender_name && currentUserName && m.sender_name === currentUserName)
            }));
            setMessages(normalized);
            setError(null);
            // auto-scroll to bottom when new messages arrive
            setTimeout(() => {
              if (messagesRef.current) {
                messagesRef.current.scrollTop = messagesRef.current.scrollHeight;
              }
            }, 50);
          }
      } catch (err) {
        if (isMounted) {
          setError('Failed to load conversation');
          setMessages([]);
        }
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    // typing indicator: notify server (legacy endpoint) that we're typing
    const notifyTyping = async () => {
      try {
        await fetch(`${import.meta.env.VITE_API_URL?.replace('/api/v1','') || 'http://localhost:5000'}/messages/typing`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${localStorage.getItem('token')}` },
          body: JSON.stringify({ other_user_id: userId })
        });
      } catch (e) {
        // ignore
      }
    };

    loadMessages();

    const interval = setInterval(loadMessages, 3000);

    return () => {
      isMounted = false;
      clearInterval(interval);
      if (typingTimerRef.current) clearTimeout(typingTimerRef.current);
    };
  }, [userId, currentUserId, currentUserName]);

  const handleSend = async () => {
    if (!text.trim()) return;

    try {
      setSending(true);
      await sendMessage(userId, text);
      setText("");
      setError(null);
      // Reload messages after sending
      const data = await fetchConversation(userId);
      setMessages(data);
      // mark messages read via legacy endpoint
      try { await fetch(`${import.meta.env.VITE_API_URL?.replace('/api/v1','') || 'http://localhost:5000'}/messages/mark-read`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${localStorage.getItem('token')}` }, body: JSON.stringify({ other_user_id: userId }) }); } catch(e) {}
    } catch (err) {
      setError('Failed to send message');
      console.error(err);
    } finally {
      setSending(false);
    }
  };

  const handleKeyPress = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
    // typing indicator
    if (e.key && e.key.length === 1) {
      // Debounce typing notification
      if (typingTimerRef.current) clearTimeout(typingTimerRef.current);
      typingTimerRef.current = setTimeout(() => {
        fetch(`${import.meta.env.VITE_API_URL?.replace('/api/v1','') || 'http://localhost:5000'}/messages/typing`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${localStorage.getItem('token')}` },
          body: JSON.stringify({ other_user_id: userId })
        }).catch(()=>{});
      }, 500);
    }
  };

  if (!userId) {
    return (
      <div className="flex-1 flex items-center justify-center bg-gradient-to-br from-primary/5 to-transparent">
        <div className="text-center">
          <svg className="w-16 h-16 mx-auto text-secondary/40 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
          </svg>
          <p className="text-gray-600">Select a conversation to start messaging</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col bg-gradient-to-br from-slate-100 via-blue-50 to-slate-100 relative" style={{height: 'calc(100vh - 64px)'}}>
      <div className="absolute inset-0 opacity-30" style={{
        backgroundImage: 'radial-gradient(circle at 20% 50%, rgba(34, 197, 94, 0.2) 0%, transparent 50%), radial-gradient(circle at 80% 20%, rgba(59, 130, 246, 0.2) 0%, transparent 50%)'
      }} />
      <div className="relative z-10 flex flex-col h-full">
      {error && (
        <div className="p-4 m-4 bg-red-50 border border-red-200 rounded-lg text-red-600 text-sm">
          {error}
        </div>
      )}

      <div ref={messagesRef} className="flex-1 p-6 overflow-y-auto space-y-4">
        {loading ? (
          <div className="flex items-center justify-center h-full">
            <div className="animate-spin h-8 w-8 border-4 border-blue-500 border-t-transparent rounded-full"></div>
          </div>
        ) : messages.length === 0 ? (
          <div className="flex items-center justify-center h-full text-gray-500">
            <p>No messages yet. Start the conversation!</p>
          </div>
        ) : (
          messages.map((msg) => (
            <MessageBubble
              key={msg.id ?? msg.timestamp}
              message={msg}
              isOwn={Boolean(msg.is_own) || (msg.sender_id && currentUserId && msg.sender_id === currentUserId)}
              senderName={msg.sender_name || msg.sender}
            />
          ))
        )}
      </div>

      <div className="p-6 border-t border-white/30 bg-white/60 backdrop-blur-md shadow-lg relative z-20">
        <div className="flex gap-3">
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyPress={handleKeyPress}
            disabled={sending}
            className="flex-1 border border-gray-300 rounded-full px-4 py-3 focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 bg-white transition-all shadow-sm"
            placeholder="Type your message..."
          />
          <button
            onClick={handleSend}
            disabled={sending || !text.trim()}
            className="bg-gradient-to-r from-blue-500 to-emerald-600 text-white px-6 py-3 rounded-full font-semibold disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-md hover:shadow-lg"
          >
            {sending ? 'Sending...' : 'Send'}
          </button>
        </div>
      </div>
      </div>
    </div>
  );
}
