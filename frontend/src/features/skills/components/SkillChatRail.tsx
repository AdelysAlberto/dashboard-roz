import { CornerDownLeft, MessageSquare, Trash2 } from 'lucide-react';
import { KeyboardEvent, useEffect, useRef, useState } from 'react';
import { Button } from '../../../components/ui/Button';
import { MarkdownRenderer } from '../../documents/components/MarkdownRenderer';
import { useSkillsStore } from '../../../stores/useSkillsStore';
import { SkillItem } from '../../../types/skill';
import { useSkillChat } from '../hooks/useSkillChat';
import { useSkills } from '../hooks/useSkills';
import './SkillChatRail.css';

const SUGGESTIONS = [
  'When do I use this instead of a general prompt?',
  'Give me two concrete tasks where this saves me time.',
  'How do I invoke it exactly?',
  'What can go wrong if I trust it blindly?',
];

export function SkillChatRail() {
  const selectedId = useSkillsStore((state) => state.selectedId);
  const { data: snapshot } = useSkills();
  const skill = snapshot?.skills.find((item) => item.id === selectedId) ?? null;

  if (!skill) {
    return (
      <aside className="skill-chat-rail skill-chat-empty">
        <MessageSquare size={24} className="skill-chat-empty-icon" />
        <p>Select a skill to ask the model what it is for and when to reach for it.</p>
      </aside>
    );
  }

  // Keyed by skill: switching skills remounts the session, which clears history.
  return (
    <SkillChatSession
      key={skill.id}
      skill={skill}
      model={snapshot?.llm.model ?? ''}
      llmReady={snapshot?.llm.configured ?? false}
    />
  );
}

interface SessionProps {
  skill: SkillItem;
  model: string;
  llmReady: boolean;
}

function SkillChatSession({ skill, model, llmReady }: SessionProps) {
  const { messages, isStreaming, error, send, clear } = useSkillChat(skill.id);
  const [draft, setDraft] = useState('');
  const scrollRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const node = scrollRef.current;
    if (node) node.scrollTop = node.scrollHeight;
  }, [messages]);

  const submit = (text: string) => {
    if (!text.trim() || isStreaming) return;
    void send(text);
    setDraft('');
  };

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      submit(draft);
    }
  };

  return (
    <aside className="skill-chat-rail">
      <header className="skill-chat-head">
        <div>
          <span className="skill-chat-title">Ask about this skill</span>
          <span className="skill-chat-sub font-mono">
            {model || 'no model'} · {skill.name}
          </span>
        </div>
        {messages.length > 0 && (
          <Button
            variant="ghost"
            size="xs"
            onClick={clear}
            leftIcon={<Trash2 size={12} />}
            title="Clear this conversation"
          >
            Clear
          </Button>
        )}
      </header>

      <div className="skill-chat-scroll" ref={scrollRef}>
        {messages.length === 0 && (
          <div className="skill-chat-intro">
            <p>
              The model reads this SKILL.md and answers in plain language. It is a documentation
              analyst, not the agent that runs the skill.
            </p>
            <div className="skill-chat-suggestions">
              {SUGGESTIONS.map((suggestion) => (
                <button
                  key={suggestion}
                  className="skill-suggestion"
                  onClick={() => submit(suggestion)}
                  disabled={!llmReady || isStreaming}
                >
                  {suggestion}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((message, index) => (
          <div key={`${message.role}-${index}`} className={`skill-msg skill-msg-${message.role}`}>
            <span className="skill-msg-role font-mono">
              {message.role === 'user' ? 'you' : 'analyst'}
            </span>
            {message.role === 'assistant' ? (
              <MarkdownRenderer content={message.content || '…'} />
            ) : (
              <p className="skill-msg-text">{message.content}</p>
            )}
          </div>
        ))}

        {error && <p className="skill-chat-error">{error}</p>}
      </div>

      <div className="skill-chat-input">
        <textarea
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={onKeyDown}
          placeholder={
            llmReady ? 'Ask anything about this skill… (Enter to send)' : 'Configure ROZ_LLM_* first'
          }
          disabled={!llmReady}
          rows={2}
          aria-label="Ask about this skill"
        />
        <Button
          variant="primary"
          size="sm"
          onClick={() => submit(draft)}
          disabled={!llmReady || isStreaming || !draft.trim()}
          isLoading={isStreaming}
          aria-label="Send question"
          leftIcon={<CornerDownLeft size={13} />}
        >
          Send
        </Button>
      </div>
    </aside>
  );
}
