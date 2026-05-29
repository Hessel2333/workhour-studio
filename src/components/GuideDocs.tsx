import { useEffect, useMemo, useRef, useState } from "react";
import overviewMarkdown from "../../web-docs/overview.md?raw";
import menuRulesMarkdown from "../../web-docs/menu-rules.md?raw";
import projectsMarkdown from "../../web-docs/projects-and-templates.md?raw";
import scheduleMarkdown from "../../web-docs/schedule-and-autofill.md?raw";
import importExportMarkdown from "../../web-docs/import-export.md?raw";
import { Badge } from "./ui/Badge";

type MarkdownBlock =
  | { type: "heading"; level: 1 | 2 | 3; text: string; id: string }
  | { type: "paragraph"; text: string }
  | { type: "list"; ordered: boolean; items: string[] };

type GuideDoc = {
  id: string;
  label: string;
  description: string;
  markdown: string;
};

const guideDocs: GuideDoc[] = [
  { id: "overview", label: "快速开始", description: "先看清这套工作台的主链路。", markdown: overviewMarkdown },
  { id: "menu-rules", label: "菜单规则", description: "工作性质、类别、项目和形式如何联动。", markdown: menuRulesMarkdown },
  { id: "projects", label: "项目与模板", description: "项目库和模板库的维护口径。", markdown: projectsMarkdown },
  { id: "schedule", label: "日程与补全", description: "时间块、草稿和自动补全的使用方式。", markdown: scheduleMarkdown },
  { id: "import-export", label: "导入导出", description: "Excel 与旧流程如何衔接。", markdown: importExportMarkdown },
];

function slugify(text: string) {
  return text
    .toLowerCase()
    .replace(/[`~!@#$%^&*()+={}\[\]|\\:;"'<>,.?/，。；：！？、（）]/g, "")
    .replace(/\s+/g, "-");
}

function parseMarkdown(markdown: string) {
  const lines = markdown.split("\n");
  const blocks: MarkdownBlock[] = [];
  const headingIds = new Map<string, number>();

  const getHeadingId = (text: string) => {
    const base = slugify(text) || "section";
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
      blocks.push({ type: "heading", level, text, id: getHeadingId(text) });
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
        if (!matcher) break;
        items.push(matcher[1].trim());
        index += 1;
      }
      blocks.push({ type: "list", ordered, items });
      continue;
    }

    const paragraphLines: string[] = [];
    while (index < lines.length) {
      const current = lines[index].trim();
      if (!current || /^(#{1,3})\s+/.test(current) || /^-\s+/.test(current) || /^\d+\.\s+/.test(current)) break;
      paragraphLines.push(current);
      index += 1;
    }
    blocks.push({ type: "paragraph", text: paragraphLines.join(" ") });
  }

  return blocks;
}

function renderInline(text: string) {
  return text.split(/(`[^`]+`)/g).filter(Boolean).map((fragment, index) =>
    fragment.startsWith("`") && fragment.endsWith("`")
      ? <code key={`${fragment}-${index}`}>{fragment.slice(1, -1)}</code>
      : <span key={`${fragment}-${index}`}>{fragment}</span>
  );
}

function getDocTitle(blocks: MarkdownBlock[], fallback: string) {
  const heading = blocks.find((block) => block.type === "heading" && block.level === 1);
  return heading?.type === "heading" ? heading.text : fallback;
}

export function GuideDocs() {
  const [activeDocId, setActiveDocId] = useState(guideDocs[0].id);
  const [activeSection, setActiveSection] = useState<string | undefined>();
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const activeDoc = guideDocs.find((doc) => doc.id === activeDocId) || guideDocs[0];
  const blocks = useMemo(() => parseMarkdown(activeDoc.markdown), [activeDoc.markdown]);
  const titleText = getDocTitle(blocks, activeDoc.label);
  const bodyBlocks = useMemo(() => blocks.filter((block) => !(block.type === "heading" && block.level === 1)), [blocks]);
  const tocItems = useMemo(
    () => bodyBlocks.filter((block): block is Extract<MarkdownBlock, { type: "heading" }> => block.type === "heading" && (block.level === 2 || block.level === 3)),
    [bodyBlocks]
  );

  useEffect(() => {
    setActiveSection(undefined);
    scrollRef.current?.scrollTo({ top: 0, behavior: "auto" });
  }, [activeDocId]);

  useEffect(() => {
    const targets = tocItems.map((item) => document.getElementById(item.id)).filter((element): element is HTMLElement => Boolean(element));
    if (!targets.length) return undefined;
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter((entry) => entry.isIntersecting).sort((left, right) => left.boundingClientRect.top - right.boundingClientRect.top);
        if (visible[0]?.target.id) setActiveSection(visible[0].target.id);
      },
      { root: scrollRef.current, rootMargin: "-8% 0px -78% 0px", threshold: [0, 1] }
    );
    targets.forEach((target) => observer.observe(target));
    return () => observer.disconnect();
  }, [activeDocId, tocItems]);

  return (
    <section className="guide-docs-page">
      <div className="guide-docs-shell">
        <aside className="guide-docs-sidebar panel-card">
          <div className="guide-docs-sidebar-head">
            <span className="guide-docs-eyebrow">使用说明</span>
            <strong>工时工作台</strong>
          </div>
          <nav className="guide-docs-nav" aria-label="说明文档目录">
            {guideDocs.map((doc) => (
              <button key={doc.id} type="button" className={`guide-docs-nav-link ${activeDocId === doc.id ? "active" : ""}`} onClick={() => setActiveDocId(doc.id)}>
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
                <span className="guide-docs-kicker">Guide</span>
                <h1>{titleText}</h1>
                <p>{activeDoc.description}</p>
              </header>
              {bodyBlocks.map((block, index) => {
                if (block.type === "heading") {
                  return block.level === 2
                    ? <section key={`${block.id}-${index}`} className="guide-docs-section-anchor"><h2 id={block.id}>{block.text}</h2></section>
                    : <h3 key={`${block.id}-${index}`} id={block.id}>{block.text}</h3>;
                }
                if (block.type === "paragraph") return <p key={`paragraph-${index}`}>{renderInline(block.text)}</p>;
                const ListTag = block.ordered ? "ol" : "ul";
                return <ListTag key={`list-${index}`}>{block.items.map((item) => <li key={item}>{renderInline(item)}</li>)}</ListTag>;
              })}
            </div>
          </div>
        </article>

        <aside className="guide-docs-rightbar panel-card">
          <div className="guide-docs-subtoc">
            <span className="guide-docs-subtoc-label">当前文档</span>
            <strong className="guide-docs-subtoc-title">{activeDoc.label}</strong>
            <Badge tone="blue">{tocItems.length} 节</Badge>
            <nav className="guide-docs-toc" aria-label="当前文档目录">
              {tocItems.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className={`guide-docs-toc-link level-${item.level} ${activeSection === item.id ? "active" : ""}`}
                  onClick={() => document.getElementById(item.id)?.scrollIntoView({ behavior: "smooth", block: "start" })}
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
