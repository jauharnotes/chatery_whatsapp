import React, { useEffect, useRef } from 'react';
import MessageBubble from './MessageBubble';

const ChatWindow = ({ messages, isLoading }) => {
  const bottomRef = useRef(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isLoading]);

  return (
    <div style={{
      flex: 1,
      overflowY: 'auto',
      padding: '2rem 1rem',
      display: 'flex',
      flexDirection: 'column',
      gap: '1rem',
      scrollBehavior: 'smooth'
    }}>
      {messages.length === 0 && (
        <div style={{
          textAlign: 'center',
          color: 'var(--text-secondary)',
          marginTop: '20vh'
        }}>
          <h2>AI Internal Assistant</h2>
          <p>Ask me anything about internal documents.</p>
        </div>
      )}
      
      {messages.map((msg, idx) => (
        <MessageBubble key={idx} message={msg} />
      ))}
      
      {isLoading && (
        <div style={{ padding: '0 1rem' }}>
          <div style={{
            display: 'inline-block',
            padding: '1rem',
            background: 'var(--bot-msg-bg)',
            borderRadius: '16px',
            borderTopLeftRadius: '4px',
            color: 'var(--text-secondary)',
            fontStyle: 'italic'
          }}>
            Thinking...
          </div>
        </div>
      )}
      
      <div ref={bottomRef} />
    </div>
  );
};

export default ChatWindow;
