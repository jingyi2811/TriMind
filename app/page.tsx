'use client';

import { useState, FormEvent, ChangeEvent, useEffect } from 'react';
import styles from "./page.module.css";
import ReactMarkdown from 'react-markdown';

export default function Home() {
  const [inputText, setInputText] = useState('');
  const [messages, setMessages] = useState<Array<{ text: string; sender: 'user' | 'bot' }>>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedModel, setSelectedModel] = useState<'claude' | 'deepseek' | 'qwen' | 'qwen_direct' | 'gemini_thinking'>('claude');

  // Handle model change directly with state update
  const handleModelChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newValue = e.target.value as 'claude' | 'deepseek' | 'qwen' | 'qwen_direct' | 'gemini_thinking';
    setSelectedModel(newValue);
    console.log('Model updated to:', newValue);
    
    // Force the select element to update
    setTimeout(() => {
      const selectElement = document.getElementById('model-select') as HTMLSelectElement;
      if (selectElement) {
        selectElement.value = newValue;
      }
    }, 0);
  };

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (inputText.trim() === '') return;

    const newMessages: Array<{ text: string; sender: 'user' | 'bot' }> = [
      ...messages,
      { text: inputText, sender: 'user' },
    ];
    setMessages(newMessages);
    setInputText('');
    setIsLoading(true);

    // Call the API route to get the AI response
    fetch('/api/chat', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ messages: newMessages, model: selectedModel }),
    })
        .then((res) => {
          if (!res.ok) {
            throw new Error('Network response was not ok');
          }
          return res.json();
        })
        .then((data) => {
          setMessages([...newMessages, { text: data.reply, sender: 'bot' as 'bot' }]);
          setIsLoading(false);
        })
        .catch((error) => {
          console.error('Error fetching AI response:', error);
          setIsLoading(false);
        });
  };

  return (
      <div className={styles.page}>
        <main className={styles.main}>
          <div className={styles.chatContainer}>
            <div className={styles.messagesContainer}>
              {messages.map((message, index) => (
                  <div
                      key={index}
                      className={`${styles.message} ${
                          message.sender === 'user' ? styles.userMessage : styles.botMessage
                      }`}
                  >
                    {message.sender === 'user' ? (
                      message.text
                    ) : (
                      <ReactMarkdown>
                        {message.text}
                      </ReactMarkdown>
                    )}
                  </div>
              ))}
              {isLoading && (
                  <div className={`${styles.message} ${styles.botMessage}`}>
                    Typing...
                  </div>
              )}
            </div>
            <div className={styles.modelSelector}>
              <label htmlFor="model-select">Select AI Model:</label>
              <select
                id="model-select"
                className={styles.improvedSelect}
                value={selectedModel}
                onChange={handleModelChange}
              >
                <option value="claude">Claude (Direct)</option>
                <option value="deepseek">DeepSeek (MCP)</option>
                <option value="qwen">Qwen (MCP)</option>
                <option value="qwen_direct">Qwen (Direct)</option>
                <option value="gemini_thinking">Gemini Thinking (via MCP Tool)</option>
              </select>
            </div>
            <form onSubmit={handleSubmit} className={styles.inputForm}>
              <input
                  type="text"
                  value={inputText}
                  onChange={(e) => setInputText(e.target.value)}
                  placeholder="Type your message here..."
                  className={styles.inputField}
              />
              <button type="submit" className={styles.submitButton}>
                Enter
              </button>
            </form>
          </div>
        </main>
      </div>
  );
}
