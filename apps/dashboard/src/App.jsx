import React, { useState } from 'react';
import ChatWindow from './components/ChatWindow';
import InputArea from './components/InputArea';
import Settings from './components/Settings';
import { askQuestion, generateImage } from './services/api';

function App() {
  const [messages, setMessages] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [activeConnectionId, setActiveConnectionId] = useState(null);
  const [connectionName, setConnectionName] = useState('');

  const handleSend = async (question) => {
    // Optimistic User Message
    const userMsg = {
      role: 'user',
      content: question,
      timestamp: new Date().toISOString()
    };
    setMessages(prev => [...prev, userMsg]);
    setIsLoading(true);

    try {
      let botMsg;
      if (question.startsWith('/image ')) {
        const prompt = question.replace('/image ', '');
        const data = await generateImage(prompt);
        botMsg = {
          role: 'assistant',
          content: `![Generated Image](${data.imageUrl})`,
          timestamp: data.timestamp || new Date().toISOString(),
          usage: data.usage
        };
      } else {
        const data = await askQuestion(question, activeConnectionId);
        botMsg = {
          role: 'assistant',
          content: data.answer,
          timestamp: data.timestamp || new Date().toISOString(),
          usage: data.usage,
          debug: data.debug
        };
      }
      
      setMessages(prev => [...prev, botMsg]);
    } catch (error) {
      const errorMsg = {
        role: 'assistant',
        content: `Error: ${error.message}`,
        timestamp: new Date().toISOString()
      };
      setMessages(prev => [...prev, errorMsg]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleConnectionSelect = (connId, connName = '') => {
    setActiveConnectionId(connId);
    setConnectionName(connName);
  };

  return (
    <>
      <header className="glass-panel" style={{
        marginTop: '1rem',
        margin: '1rem 1rem 0',
        padding: '1rem 2rem',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <div style={{
            width: '12px', height: '12px', borderRadius: '50%',
            background: activeConnectionId ? '#00ff88' : '#00d2ff', 
            boxShadow: `0 0 10px ${activeConnectionId ? '#00ff88' : '#00d2ff'}`
          }}></div>
          <h1 style={{ fontSize: '1.2rem', fontWeight: 600 }}>Internal AI Assistant</h1>
          {activeConnectionId && (
            <span style={{ 
              fontSize: '0.85rem', 
              padding: '0.25rem 0.75rem', 
              background: 'rgba(0,255,136,0.15)', 
              borderRadius: '20px',
              color: '#00ff88'
            }}>
              📊 {connectionName || 'Database Connected'}
            </span>
          )}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <div style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
            {activeConnectionId ? 'SQL Agent Mode' : 'RAG Mode'}
          </div>
          <button 
            onClick={() => setShowSettings(true)}
            style={{
              padding: '0.5rem 1rem',
              borderRadius: '8px',
              border: '1px solid var(--border-color)',
              background: 'var(--bg-secondary)',
              color: 'var(--text-primary)',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem'
            }}
          >
            ⚙️ Database
          </button>
        </div>
      </header>

      <ChatWindow messages={messages} isLoading={isLoading} />
      <InputArea onSend={handleSend} isLoading={isLoading} />

      {showSettings && (
        <Settings 
          onClose={() => setShowSettings(false)}
          onConnectionSelect={(id, name) => {
            handleConnectionSelect(id, name);
            setShowSettings(false);
          }}
          activeConnectionId={activeConnectionId}
        />
      )}
    </>
  );
}

export default App;
