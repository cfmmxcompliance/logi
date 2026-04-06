import React, { useState, useRef, useEffect } from 'react';
import { Send, Bot, Loader2, Sparkles, User as UserIcon, ShieldAlert } from 'lucide-react';
import { geminiService } from '../services/geminiService';
import { useAuth } from '../context/AuthContext';

interface ChatMessage {
  role: 'user' | 'model';
  parts: [{ text: string }];
  timestamp: Date;
}

export const AIAssistant: React.FC = () => {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const { user } = useAuth();

  useEffect(() => {
    // Scroll to bottom whenever messages change
    if (scrollRef.current) {
        scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const handleSend = async () => {
    if (!input.trim() || isLoading) return;

    const userMessage: ChatMessage = {
      role: 'user',
      parts: [{ text: input.trim() }],
      timestamp: new Date()
    };

    const updatedMessages = [...messages, userMessage];
    setMessages(updatedMessages);
    setInput('');
    setIsLoading(true);

    try {
      // Pass the conversation history (minus timestamps for strict GenAI type matching if needed)
      const historyToSend = updatedMessages.map(m => ({
          role: m.role,
          parts: [{ text: m.parts[0].text }]
      }));

      const replyText = await geminiService.chatAssistant(historyToSend);

      setMessages(prev => [...prev, {
        role: 'model',
        parts: [{ text: replyText }],
        timestamp: new Date()
      }]);
    } catch (error) {
       console.error(error);
       setMessages(prev => [...prev, {
        role: 'model',
        parts: [{ text: "Error de conexión con el Asistente AI. Por favor, reintenta más tarde." }],
        timestamp: new Date()
      }]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="flex flex-col h-full bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
      {/* Header */}
      <div className="p-5 border-b border-slate-200 flex items-center justify-between bg-slate-50">
         <div className="flex items-center gap-3">
             <div className="h-10 w-10 bg-indigo-100 text-indigo-600 rounded-xl flex items-center justify-center">
                 <Sparkles size={22} />
             </div>
             <div>
                <h1 className="text-xl font-bold text-slate-800">Logimaster AI Assistant</h1>
                <p className="text-xs text-slate-500 font-medium">Powered by Gemini 2.0 Flash</p>
             </div>
         </div>
      </div>

      {/* Chat History */}
      <div className="flex-1 overflow-y-auto p-6 space-y-6 bg-slate-50/50" ref={scrollRef}>
          {messages.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-slate-400 space-y-4">
                  <Bot size={48} className="text-indigo-200" />
                  <p className="text-center font-medium">Hola, {user?.nombre || 'Administrador'}.<br/>Soy tu asistente de datos aduanales y logística.<br/>¿En qué te puedo ayudar hoy?</p>
              </div>
          ) : (
              messages.map((msg, idx) => (
                  <div key={idx} className={`flex gap-4 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                      {msg.role === 'model' && (
                          <div className="h-8 w-8 rounded-full bg-indigo-600 flex-shrink-0 flex items-center justify-center text-white">
                              <Bot size={16} />
                          </div>
                      )}
                      
                      <div className={`max-w-[75%] rounded-2xl px-5 py-3 ${msg.role === 'user' ? 'bg-indigo-600 text-white rounded-br-none' : 'bg-white border border-slate-200 text-slate-700 shadow-sm rounded-bl-none'}`}>
                         <p className="whitespace-pre-wrap text-sm leading-relaxed">{msg.parts[0].text}</p>
                         <span className={`text-[10px] mt-2 block ${msg.role === 'user' ? 'text-indigo-200 text-right' : 'text-slate-400'}`}>
                             {msg.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                         </span>
                      </div>

                      {msg.role === 'user' && (
                          <div className="h-8 w-8 rounded-full bg-slate-200 flex-shrink-0 flex items-center justify-center text-slate-600">
                              <UserIcon size={16} />
                          </div>
                      )}
                  </div>
              ))
          )}
          {isLoading && (
              <div className="flex gap-4 justify-start">
                  <div className="h-8 w-8 rounded-full bg-indigo-600 flex-shrink-0 flex items-center justify-center text-white">
                      <Bot size={16} />
                  </div>
                  <div className="bg-white border border-slate-200 text-slate-500 shadow-sm rounded-2xl rounded-bl-none px-5 py-3 flex items-center gap-2">
                       <Loader2 size={16} className="animate-spin text-indigo-600"/>
                       <span className="text-sm font-medium">Analizando...</span>
                  </div>
              </div>
          )}
      </div>

      {/* Input Area */}
      <div className="p-4 border-t border-slate-200 bg-white">
          <div className="relative flex items-end gap-3 max-w-5xl mx-auto">
             <textarea 
               value={input}
               onChange={(e) => setInput(e.target.value)}
               onKeyDown={handleKeyDown}
               placeholder="Escribe tu consulta logística aquí (Ej. ¿Qué incoterm se usa en el pedimento 123?)..."
               className="w-full bg-slate-100 border-transparent focus:bg-white focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 transition-all resize-none rounded-xl py-3 px-4 text-sm text-slate-700 min-h-[50px] max-h-[150px]"
               rows={Math.min(5, input.split('\n').length || 1)}
               disabled={isLoading}
             />
             <button 
                onClick={handleSend}
                disabled={!input.trim() || isLoading}
                className="mb-1 h-11 px-5 bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-300 disabled:cursor-not-allowed text-white rounded-xl shadow-sm transition-colors flex items-center gap-2 font-medium"
             >
                 <Send size={18} />
                 <span>Enviar</span>
             </button>
          </div>
          <p className="text-center text-[10px] text-slate-400 mt-3 font-medium">
             Logimaster AI puede cometer errores. Verifica siempre los documentos aduanales físicos o en Data Stage.
          </p>
      </div>
    </div>
  );
};
