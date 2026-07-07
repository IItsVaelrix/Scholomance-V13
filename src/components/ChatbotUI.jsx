import React, { useState, useEffect, useRef } from 'react';
import './ChatbotUI.css';

export function ChatbotUI({ title = "Oracle Memory Terminal" }) {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [sessionId, setSessionId] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef(null);

  useEffect(() => {
    // Generate a simple unique ID for the session
    setSessionId(Math.random().toString(36).substring(2, 15)); // EXEMPT IMMUNE_ALLOW: math-random - UI session id
    setMessages([{ sender: 'bot', text: 'The Oracle awakens. What do you seek?' }]);
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = async (e) => {
    e.preventDefault();
    if (!input.trim() || isLoading) return;

    const userMsg = input.trim();
    setInput('');
    setMessages(prev => [...prev, { sender: 'user', text: userMsg }]);
    setIsLoading(true);

    let speculativeEnvelope = null;
    if (typeof window !== 'undefined' && window.SpeculativeContextBuffer) {
      speculativeEnvelope = window.SpeculativeContextBuffer.drainForMessage();
    }

    try {
      const response = await fetch('http://localhost:8000/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ session_id: sessionId, message: userMsg, speculativeEnvelope }),
      });

      if (!response.ok) {
        throw new Error(`Server returned ${response.status}`);
      }

      const data = await response.json();
      setMessages(prev => [...prev, { sender: 'bot', text: data.response }]);
    } catch (error) {
      console.error(error);
      setMessages(prev => [...prev, { sender: 'error', text: 'The connection to the Oracle is severed.' }]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleClear = () => {
    setSessionId(Math.random().toString(36).substring(2, 15)); // EXEMPT IMMUNE_ALLOW: math-random - UI session id
    setMessages([{ sender: 'bot', text: 'Memory cleared. A new thread begins.' }]);
  };

  return (
    <section className="chatbot-interface-for-the-surface grim-breathe" aria-label={title}>
      <header className="chatbot-interface-for-the-surface__header">
        <span>{title}</span>
        <button onClick={handleClear} className="chatbot-interface-for-the-surface__clear" type="button">Purge</button>
      </header>
      
      <div className="chatbot-interface-for-the-surface__body">
        <div className="chatbot-interface-for-the-surface__messages">
          {messages.map((msg, idx) => (
            <div key={idx} className={`chatbot-message chatbot-message--${msg.sender}`}>
              <span className="chatbot-message__sender">
                {msg.sender === 'user' ? 'You' : msg.sender === 'bot' ? 'Oracle' : 'System'}
              </span>
              <p className="chatbot-message__text">{msg.text}</p>
            </div>
          ))}
          {isLoading && (
            <div className="chatbot-message chatbot-message--loading">
              <p className="chatbot-message__text">Divining...</p>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>
      </div>

      <footer className="chatbot-interface-for-the-surface__footer">
        <form onSubmit={handleSend} className="chatbot-interface-for-the-surface__form">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Consult the Oracle..."
            className="chatbot-interface-for-the-surface__input"
            disabled={isLoading}
          />
          <button type="submit" disabled={!input.trim() || isLoading} className="chatbot-interface-for-the-surface__submit">
            Send
          </button>
        </form>
      </footer>
    </section>
  );
}
