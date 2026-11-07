import type { Nodes, RootContent } from 'mdast';
import { fromMarkdown } from 'mdast-util-from-markdown';
import { gfmFromMarkdown } from 'mdast-util-gfm';
import { gfm } from 'micromark-extension-gfm';
import { toSafeExternalUrl } from '../security/safe-link';
import { fixCjkEmphasis } from '../../shared/writing-assistant/cjk-emphasis';

/**
 * Renders model output as DOM for the in-page writing assistant, which runs in
 * a content script without React. Markdown is parsed to an AST and every node
 * is built with createElement/textContent: raw HTML is shown as text, images
 * become their alt text, and links keep only safe external URLs.
 */
export function renderMarkdown(document: Document, markdown: string): DocumentFragment {
  const tree = fromMarkdown(fixCjkEmphasis(markdown), {
    extensions: [gfm()],
    mdastExtensions: [gfmFromMarkdown()],
  });
  const fragment = document.createDocumentFragment();
  for (const child of tree.children) appendNode(document, fragment, child);
  return fragment;
}

function appendChildren(document: Document, parent: Node, node: Nodes): void {
  if (!('children' in node)) return;
  for (const child of node.children as RootContent[]) appendNode(document, parent, child);
}

function element(document: Document, parent: Node, tag: string, node?: Nodes): HTMLElement {
  const created = document.createElement(tag);
  if (node) appendChildren(document, created, node);
  parent.appendChild(created);
  return created;
}

function appendNode(document: Document, parent: Node, node: RootContent): void {
  switch (node.type) {
    case 'text':
    case 'html':
      parent.appendChild(document.createTextNode(node.value));
      return;
    case 'paragraph':
      element(document, parent, 'p', node);
      return;
    case 'heading':
      element(document, parent, `h${Math.min(6, Math.max(1, node.depth))}`, node);
      return;
    case 'strong':
      element(document, parent, 'strong', node);
      return;
    case 'emphasis':
      element(document, parent, 'em', node);
      return;
    case 'delete':
      element(document, parent, 'del', node);
      return;
    case 'blockquote':
      element(document, parent, 'blockquote', node);
      return;
    case 'list': {
      const list = element(document, parent, node.ordered ? 'ol' : 'ul', node);
      if (node.ordered && node.start !== null && node.start !== undefined && node.start !== 1) {
        list.setAttribute('start', String(node.start));
      }
      return;
    }
    case 'listItem': {
      const item = document.createElement('li');
      if (typeof node.checked === 'boolean') item.append(node.checked ? '☑ ' : '☐ ');
      // Tight list items hold a single paragraph; unwrap it like Markdown renderers do.
      for (const child of node.children) {
        if (child.type === 'paragraph' && !node.spread) appendChildren(document, item, child);
        else appendNode(document, item, child);
      }
      parent.appendChild(item);
      return;
    }
    case 'inlineCode':
      element(document, parent, 'code').textContent = node.value;
      return;
    case 'code': {
      const pre = element(document, parent, 'pre');
      element(document, pre, 'code').textContent = node.value;
      return;
    }
    case 'break':
      parent.appendChild(document.createElement('br'));
      return;
    case 'thematicBreak':
      parent.appendChild(document.createElement('hr'));
      return;
    case 'link': {
      const href = toSafeExternalUrl(node.url);
      if (!href) {
        element(document, parent, 'span', node);
        return;
      }
      const link = element(document, parent, 'a', node) as HTMLAnchorElement;
      link.href = href;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      link.setAttribute('referrerpolicy', 'no-referrer');
      return;
    }
    case 'image':
      parent.appendChild(document.createTextNode(node.alt ?? ''));
      return;
    case 'table': {
      const table = element(document, parent, 'table');
      node.children.forEach((row, index) => {
        const tr = element(document, table, 'tr');
        for (const cell of row.children) element(document, tr, index === 0 ? 'th' : 'td', cell);
      });
      return;
    }
    default:
      // Definitions, footnotes and other rare nodes fall back to their text.
      appendChildren(document, parent, node);
  }
}
