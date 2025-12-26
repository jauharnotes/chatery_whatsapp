import React, { useState } from 'react';
import ChatWindow from './components/ChatWindow';
import InputArea from './components/InputArea';
import { askQuestion, generateImage } from './services/api';

function App() {
  const [messages, setMessages] = useState([]);
  const [isLoading, setIsLoading] = useState(false);

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
        const data = await askQuestion(question);
        botMsg = {
          role: 'assistant',
          content: data.answer,
          timestamp: data.timestamp || new Date().toISOString(),
          usage: data.usage
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
            background: '#00d2ff', boxShadow: '0 0 10px #00d2ff'
          }}></div>
          <h1 style={{ fontSize: '1.2rem', fontWeight: 600 }}>Internal AI Assistant</h1>
        </div>
        <div style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
          Private • Secure • Internal Only
        </div>
      </header>

      <ChatWindow messages={messages} isLoading={isLoading} />
      <InputArea onSend={handleSend} isLoading={isLoading} />
    </>
  );
}

export default App;
