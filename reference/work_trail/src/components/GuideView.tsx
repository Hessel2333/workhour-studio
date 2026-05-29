import { useEffect, useMemo, useRef, useState } from 'react';
import type { AppState } from '../types';
import gettingStartedMarkdown from '../content/guide/getting-started.md?raw';
import interactionsMarkdown from '../content/guide/interactions.md?raw';
import rolesMarkdown from '../content/guide/roles-and-views.md?raw';
import statesMarkdown from '../content/guide/states-and-metrics.md?raw';
import tasksMarkdown from '../content/guide/tasks-and-schedule.md?raw';

interface GuideViewProps {
  state: AppState;
  selectedDate: string;
}

type MarkdownBlock =
  | { type: 'heading'; level: 1 | 2 | 3; text: string; id: string }
  | { type: 'paragraph'; text: string }
  | { type: 'list'; ordered: boolean; items: string[] };

type GuideDoc = {
  id: string;
  label: string;
  description: string;
  markdown: string;
};

const guideDocs: GuideDoc[] = [
  {
    id: 'getting-started',
    label: '快速开始',
    description: '先理解整套系统是怎么串起来的。',
    markdown: gettingStartedMarkdown
  },
  {
    id: 'roles-and-views',
    label: '角色与视角',
    description: '主管、产品、研发分别看到什么。',
    markdown: rolesMarkdown
  },
  {
    id: 'tasks-and-schedule',
    label: '任务与日程',
    description: '任务如何进入日程，日程如何回写数据。',
    markdown: tasksMarkdown
  },
  {
    id: 'interactions',
    label: '关键交互',
    description: '拖拽、复制、撤销和时间块调整。',
    markdown: interactionsMarkdown
  },
  {
    id: 'states-and-metrics',
    label: '状态与口径',
    description: '阻塞、返工、冲突和统计口径。',
    markdown: statesMarkdown
  }
];

function slugify(text: string) {
  return text
    .toLowerCase()
    .replace(/[`~!@#$%^&*()+={}\[\]|\\:;"'<>,.?/]/g, '')
    .replace(/\s+/g, '-');
}

function parseMarkdown(markdown: string) {
  const lines = markdown.split('\n');
  const blocks: MarkdownBlock[] = [];
  const headingIds = new Map<string, number>();

  const getHeadingId = (text: string) => {
    const base = slugify(text);
    const count = headingIds.get(base) ?? 0;
    headingIds.set(base, count + 1);
    return count === 0 ? base : `${base}-${count + 1}`;
  };

  let index = 0;

  while (index < lines.length) {
    const line = lines[index].trim();

    if (!line) {
      index += 1;
      continue;
    }

    const headingMatch = line.match(/^(#{1,3})\s+(.*)$/);
    if (headingMatch) {
      const level = headingMatch[1].length as 1 | 2 | 3;
      const text = headingMatch[2].trim();
      blocks.push({ type: 'heading', level, text, id: getHeadingId(text) });
      index += 1;
      continue;
    }

    const orderedMatch = line.match(/^\d+\.\s+(.*)$/);
    const unorderedMatch = line.match(/^-\s+(.*)$/);
    if (orderedMatch || unorderedMatch) {
      const ordered = Boolean(orderedMatch);
      const items: string[] = [];

      while (index < lines.length) {
        const current = lines[index].trim();
        const matcher = ordered ? current.match(/^\d+\.\s+(.*)$/) : current.match(/^-\s+(.*)$/);
        if (!matcher) {
          break;
        }
        items.push(matcher[1].trim());
        index += 1;
      }

      blocks.push({ type: 'list', ordered, items });
      continue;
    }

    const paragraphLines: string[] = [];
    while (index < lines.length) {
      const current = lines[index].trim();
      if (!current || /^(#{1,3})\s+/.test(current) || /^-\s+/.test(current) || /^\d+\.\s+/.test(current)) {
        break;
      }
      paragraphLines.push(current);
      index += 1;
    }

    blocks.push({ type: 'paragraph', text: paragraphLines.join(' ') });
  }

  return blocks;
}

function renderInline(text: string) {
  const fragments = text.split(/(`[^`]+`)/g).filter(Boolean);
  return fragments.map((fragment, index) =>
    fragment.startsWith('`') && fragment.endsWith('`') ? (
      <code key={`${fragment}-${index}`}>{fragment.slice(1, -1)}</code>
    ) : (
      <span key={`${fragment}-${index}`}>{fragment}</span>
    )
  );
}

function getDocTitle(blocks: MarkdownBlock[], fallback: string) {
  const heading = blocks.find((block) => block.type === 'heading' && block.level === 1);
  return heading?.type === 'heading' ? heading.text : fallback;
}

export function GuideView({ state }: GuideViewProps) {
  const currentUser = state.employees.find((employee) => employee.id === state.currentUserId)!;
  const [activeDocId, setActiveDocId] = useState<string>(guideDocs[0].id);
  const [activeSection, setActiveSection] = useState<string | undefined>(undefined);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const activeDoc = guideDocs.find((doc) => doc.id === activeDocId) ?? guideDocs[0];
  const blocks = useMemo(() => parseMarkdown(activeDoc.markdown), [activeDoc.markdown]);
  const titleText = getDocTitle(blocks, activeDoc.label);
  const bodyBlocks = useMemo(() => blocks.filter((block) => !(block.type === 'heading' && block.level === 1)), [blocks]);
  const tocItems = useMemo(
    () =>
      bodyBlocks.filter(
        (block): block is Extract<MarkdownBlock, { type: 'heading' }> =>
          block.type === 'heading' && (block.level === 2 || block.level === 3)
      ),
    [bodyBlocks]
  );

  useEffect(() => {
    setActiveSection(undefined);
    scrollRef.current?.scrollTo({ top: 0, behavior: 'auto' });
  }, [activeDocId]);

  useEffect(() => {
    const targets = tocItems
      .map((item) => document.getElementById(item.id))
      .filter((element): element is HTMLElement => Boolean(element));

    if (targets.length === 0) {
      return undefined;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        const visibleEntries = entries
          .filter((entry) => entry.isIntersecting)
          .sort((left, right) => left.boundingClientRect.top - right.boundingClientRect.top);

        if (visibleEntries[0]?.target.id) {
          setActiveSection(visibleEntries[0].target.id);
        }
      },
      {
        root: scrollRef.current,
        rootMargin: '-8% 0px -78% 0px',
        threshold: [0, 1]
      }
    );

    targets.forEach((target) => observer.observe(target));

    return () => observer.disconnect();
  }, [tocItems, activeDocId]);

  return (
    <section className="page-shell guide-docs-page">
      <div className="guide-docs-shell">
        <aside className="guide-docs-sidebar panel-card">
          <div className="guide-docs-sidebar-head">
            <span className="guide-docs-eyebrow">系统说明</span>
            <strong>{currentUser.name} 当前视角</strong>
            <p>{currentUser.title}</p>
          </div>

          <nav className="guide-docs-nav" aria-label="说明文档目录">
            {guideDocs.map((doc) => (
              <button
                key={doc.id}
                type="button"
                className={`guide-docs-nav-link ${activeDocId === doc.id ? 'active' : ''}`}
                onClick={() => setActiveDocId(doc.id)}
              >
                <strong>{doc.label}</strong>
                <span>{doc.description}</span>
              </button>
            ))}
          </nav>
        </aside>

        <article className="guide-docs-article panel-card">
          <div ref={scrollRef} className="guide-docs-scroll">
            <div className="guide-docs-content">
              <header className="guide-docs-title">
                <span className="guide-docs-kicker">Documentation</span>
                <h1>{titleText}</h1>
                <p>{activeDoc.description}</p>
              </header>
              {bodyBlocks.map((block, index) => {
                  if (block.type === 'heading') {
                    if (block.level === 2) {
                      return (
                        <section key={`${block.id}-${index}`} className="guide-docs-section-anchor">
                          <h2 id={block.id}>{block.text}</h2>
                        </section>
                      );
                    }

                    return <h3 key={`${block.id}-${index}`} id={block.id}>{block.text}</h3>;
                  }

                  if (block.type === 'paragraph') {
                    return <p key={`paragraph-${index}`}>{renderInline(block.text)}</p>;
                  }

                  if (block.ordered) {
                    return (
                      <ol key={`list-${index}`}>
                        {block.items.map((item) => (
                          <li key={item}>{renderInline(item)}</li>
                        ))}
                      </ol>
                    );
                  }

                  return (
                    <ul key={`list-${index}`}>
                      {block.items.map((item) => (
                        <li key={item}>{renderInline(item)}</li>
                      ))}
                    </ul>
                  );
              })}
            </div>
          </div>
        </article>

        <aside className="guide-docs-rightbar panel-card">
          <div className="guide-docs-subtoc">
            <span className="guide-docs-subtoc-label">当前文档</span>
            <strong className="guide-docs-subtoc-title">{activeDoc.label}</strong>
            <nav className="guide-docs-toc" aria-label="当前文档目录">
              {tocItems.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className={`guide-docs-toc-link level-${item.level} ${activeSection === item.id ? 'active' : ''}`}
                  onClick={() => {
                    const target = document.getElementById(item.id);
                    target?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                  }}
                >
                  {item.text}
                </button>
              ))}
            </nav>
          </div>
        </aside>
      </div>
    </section>
  );
}
