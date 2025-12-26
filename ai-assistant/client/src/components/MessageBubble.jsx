import React from 'react';
import ReactMarkdown from 'react-markdown';

const MessageBubble = ({ message }) => {
  const isUser = message.role === 'user';
  
  return (
    <div style={{
      display: 'flex',
      justifyContent: isUser ? 'flex-end' : 'flex-start',
      marginBottom: '1rem',
      padding: '0 1rem'
    }}>
      <div style={{
        maxWidth: '80%',
        padding: '1rem 1.5rem',
        borderRadius: '16px',
        borderBottomRightRadius: isUser ? '4px' : '16px',
        borderBottomLeftRadius: !isUser ? '4px' : '16px',
        background: isUser ? 'var(--user-msg-bg)' : 'var(--bot-msg-bg)',
        backdropFilter: 'blur(8px)',
        border: '1px solid var(--glass-border)',
        color: 'var(--text-primary)',
        boxShadow: '0 2px 10px rgba(0,0,0,0.1)'
      }}>
        {isUser ? (
          <p>{message.content}</p>
        ) : (
          <div className="markdown-content">
            <ReactMarkdown components={{
              img: ({node, ...props}) => <img {...props} style={{maxWidth: '100%', borderRadius: '8px', marginTop: '10px'}} />
            }}>
              {message.content}
            </ReactMarkdown>
          </div>
        )}
        <div style={{
          display: 'flex',
          justifyContent: 'flex-end',
          alignItems: 'center',
          gap: '10px',
          marginTop: '0.5rem',
          fontSize: '0.75rem',
          color: 'var(--text-secondary)'
        }}>
          {message.usage && (
            <span style={{ 
              background: 'rgba(255,255,255,0.1)', 
              padding: '2px 6px', 
              borderRadius: '4px' 
            }}>
              {typeof message.usage.total_tokens === 'number' 
                ? `${message.usage.total_tokens} tokens` 
                : message.usage.total_tokens || JSON.stringify(message.usage)}
            </span>
          )}
          <span>
            {new Date(message.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </span>
        </div>
      </div>
    </div>
  );
};

export default MessageBubble;
