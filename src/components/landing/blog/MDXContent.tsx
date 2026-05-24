import { Fragment, type ReactNode } from "react";

type Props = {
  body: string;
  className?: string;
};

// Renderer markdown-lite para los posts hand-written del blog.
// Cubre H2/H3, párrafos, listas (- / 1.), blockquote, separadores y enlaces +
// énfasis inline (**bold**, *italic*, `code`). No depende de MDX runtime — la
// migración a `next-mdx-remote/rsc` vive en un follow-up cuando el set crezca
// o necesitemos componentes embebidos.
export function MDXContent({ body, className }: Props) {
  const blocks = parseBlocks(body);
  return (
    <div className={`prose-blog ${className ?? ""}`} style={{ maxWidth: 720 }}>
      {blocks.map((b, i) => renderBlock(b, i))}
    </div>
  );
}

type Block =
  | { kind: "h2"; text: string }
  | { kind: "h3"; text: string }
  | { kind: "p"; text: string }
  | { kind: "ul"; items: string[] }
  | { kind: "ol"; items: string[] }
  | { kind: "blockquote"; text: string }
  | { kind: "hr" };

function parseBlocks(src: string): Block[] {
  const lines = src.replace(/\r\n/g, "\n").split("\n");
  const blocks: Block[] = [];
  let i = 0;
  while (i < lines.length) {
    const raw = lines[i];
    const line = raw.trimEnd();
    if (line.trim() === "") {
      i++;
      continue;
    }
    if (line.startsWith("## ")) {
      blocks.push({ kind: "h2", text: line.slice(3).trim() });
      i++;
      continue;
    }
    if (line.startsWith("### ")) {
      blocks.push({ kind: "h3", text: line.slice(4).trim() });
      i++;
      continue;
    }
    if (line.trim() === "---") {
      blocks.push({ kind: "hr" });
      i++;
      continue;
    }
    if (line.startsWith("> ")) {
      const quoteLines: string[] = [line.slice(2)];
      i++;
      while (i < lines.length && lines[i].startsWith("> ")) {
        quoteLines.push(lines[i].slice(2));
        i++;
      }
      blocks.push({ kind: "blockquote", text: quoteLines.join(" ") });
      continue;
    }
    if (/^[-*]\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^[-*]\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^[-*]\s+/, ""));
        i++;
      }
      blocks.push({ kind: "ul", items });
      continue;
    }
    if (/^\d+\.\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\d+\.\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\d+\.\s+/, ""));
        i++;
      }
      blocks.push({ kind: "ol", items });
      continue;
    }
    const paraLines: string[] = [line];
    i++;
    while (
      i < lines.length &&
      lines[i].trim() !== "" &&
      !/^(#{2,3}\s|>\s|---$|[-*]\s|\d+\.\s)/.test(lines[i])
    ) {
      paraLines.push(lines[i].trim());
      i++;
    }
    blocks.push({ kind: "p", text: paraLines.join(" ") });
  }
  return blocks;
}

function renderBlock(b: Block, key: number): ReactNode {
  switch (b.kind) {
    case "h2":
      return (
        <h2
          key={key}
          className="font-heading"
          style={{
            fontSize: 26,
            fontWeight: 800,
            lineHeight: 1.2,
            letterSpacing: "-0.02em",
            margin: 0,
            marginTop: 40,
            marginBottom: 14,
          }}
        >
          {renderInline(b.text)}
        </h2>
      );
    case "h3":
      return (
        <h3
          key={key}
          className="font-heading"
          style={{
            fontSize: 20,
            fontWeight: 700,
            lineHeight: 1.25,
            letterSpacing: "-0.015em",
            margin: 0,
            marginTop: 28,
            marginBottom: 10,
          }}
        >
          {renderInline(b.text)}
        </h3>
      );
    case "p":
      return (
        <p
          key={key}
          style={{
            fontSize: 17,
            lineHeight: 1.7,
            color: "var(--fg)",
            margin: "0 0 18px",
          }}
        >
          {renderInline(b.text)}
        </p>
      );
    case "ul":
      return (
        <ul
          key={key}
          style={{
            paddingLeft: 22,
            margin: "0 0 20px",
            display: "grid",
            gap: 8,
            fontSize: 17,
            lineHeight: 1.6,
            color: "var(--fg)",
            listStyle: "disc",
          }}
        >
          {b.items.map((it, idx) => (
            <li key={idx}>{renderInline(it)}</li>
          ))}
        </ul>
      );
    case "ol":
      return (
        <ol
          key={key}
          style={{
            paddingLeft: 22,
            margin: "0 0 20px",
            display: "grid",
            gap: 8,
            fontSize: 17,
            lineHeight: 1.6,
            color: "var(--fg)",
            listStyle: "decimal",
          }}
        >
          {b.items.map((it, idx) => (
            <li key={idx}>{renderInline(it)}</li>
          ))}
        </ol>
      );
    case "blockquote":
      return (
        <blockquote
          key={key}
          style={{
            margin: "24px 0",
            paddingLeft: 16,
            borderLeft: "3px solid var(--primary)",
            fontStyle: "italic",
            fontSize: 19,
            lineHeight: 1.5,
            color: "var(--fg)",
          }}
        >
          {renderInline(b.text)}
        </blockquote>
      );
    case "hr":
      return (
        <hr
          key={key}
          style={{
            border: 0,
            borderTop: "1px solid var(--border-subtle)",
            margin: "32px 0",
          }}
        />
      );
  }
}

function renderInline(text: string): ReactNode {
  const nodes: ReactNode[] = [];
  let rest = text;
  let safety = 500;
  while (rest.length > 0 && safety-- > 0) {
    const next = findNextToken(rest);
    if (!next) {
      nodes.push(rest);
      break;
    }
    if (next.start > 0) {
      nodes.push(rest.slice(0, next.start));
    }
    nodes.push(next.node);
    rest = rest.slice(next.end);
  }
  return (
    <>
      {nodes.map((n, i) => (
        <Fragment key={i}>{n}</Fragment>
      ))}
    </>
  );
}

type Token = { start: number; end: number; node: ReactNode };

function findNextToken(s: string): Token | null {
  const patterns: Array<{
    re: RegExp;
    make: (m: RegExpExecArray) => ReactNode;
  }> = [
    {
      re: /\[([^\]]+)\]\(([^)]+)\)/,
      make: (m) => (
        <a
          href={m[2]}
          style={{
            color: "var(--primary-active)",
            textDecoration: "underline",
            textUnderlineOffset: 3,
          }}
        >
          {m[1]}
        </a>
      ),
    },
    {
      re: /\*\*([^*]+)\*\*/,
      make: (m) => <strong>{m[1]}</strong>,
    },
    {
      re: /(?<!\*)\*([^*]+)\*(?!\*)/,
      make: (m) => <em>{m[1]}</em>,
    },
    {
      re: /`([^`]+)`/,
      make: (m) => (
        <code
          style={{
            background: "var(--muted)",
            padding: "2px 6px",
            borderRadius: 4,
            fontSize: "0.92em",
            fontFamily:
              "ui-monospace, SFMono-Regular, Menlo, monospace",
          }}
        >
          {m[1]}
        </code>
      ),
    },
  ];
  let best: Token | null = null;
  for (const p of patterns) {
    const m = p.re.exec(s);
    if (!m) continue;
    const start = m.index;
    if (best === null || start < best.start) {
      best = { start, end: start + m[0].length, node: p.make(m) };
    }
  }
  return best;
}
