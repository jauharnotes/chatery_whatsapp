import React, { useState } from 'react';

const InputArea = ({ onSend, isLoading }) => {
  const [input, setInput] = useState('');

  const handleSubmit = (e) => {
    e.preventDefault();
    if (input.trim() && !isLoading) {
      onSend(input.trim());
      setInput('');
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  };

  return (
    <div className="glass-panel" style={{
      padding: '1rem',
      margin: '0 1rem 1rem',
      display: 'flex',
      gap: '1rem',
      alignItems: 'flex-end'
    }}>
      <textarea
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="Ask anything from the internal knowledge base..."
        disabled={isLoading}
        style={{
          flex: 1,
          background: 'transparent',
          border: 'none',
          color: 'var(--text-primary)',
          fontSize: '1rem',
          resize: 'none',
          outline: 'none',
          maxHeight: '100px',
          minHeight: '2rem',
          fontFamily: 'inherit',
          lineHeight: '1.5'
        }}
        rows={1}
      />
      <button 
        className="btn-primary" 
        onClick={handleSubmit} 
        disabled={!input.trim() || isLoading}
        style={{ height: 'fit-content' }}
      >
        {isLoading ? (
          <span className="spinner">...</span>
        ) : (
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="22" y1="2" x2="11" y2="13"></line>
            <polygon points="22 2 15 22 11 13 2 9 22 2"></polygon>
          </svg>
        )}
      </button>
    </div>
  );
};

export default InputArea;
