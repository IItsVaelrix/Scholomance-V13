import { TextNode } from 'lexical';

// decodeBytecode returns { style, className, color }. The viseme/glow CSS lives in
// `style` as custom properties (--vb-*) and the effect tier in `className`
// (vb-effect--*, vb-school--*, vb-anchor). Apply both correctly — iterating the
// whole object as inline styles (the old bug) set dom.style.style/className and
// dropped every actual glow property.
export function applyDecoded(dom, decoded) {
  if (!decoded) return;
  if (decoded.style) {
    for (const [key, value] of Object.entries(decoded.style)) {
      if (value == null) continue;
      if (key.startsWith('--')) dom.style.setProperty(key, String(value));
      else dom.style[key] = value;
    }
  }
  if (decoded.className) {
    decoded.className.split(/\s+/).filter(Boolean).forEach((c) => dom.classList.add(c));
  }
}

export function removeDecoded(dom, decoded) {
  if (!decoded) return;
  if (decoded.style) {
    for (const key of Object.keys(decoded.style)) {
      if (key.startsWith('--')) dom.style.removeProperty(key);
      else dom.style[key] = '';
    }
  }
  if (decoded.className) {
    decoded.className.split(/\s+/).filter(Boolean).forEach((c) => dom.classList.remove(c));
  }
}

// classList.add/remove throw on a string containing spaces. __truesightClass is
// space-separated (e.g. "grimoire-word--SONIC grimoire-word--active"), so split it.
function addClasses(dom, str) {
  if (!str) return;
  str.split(/\s+/).filter(Boolean).forEach((c) => dom.classList.add(c));
}
function removeClasses(dom, str) {
  if (!str) return;
  str.split(/\s+/).filter(Boolean).forEach((c) => dom.classList.remove(c));
}

export class TruesightWordNode extends TextNode {
  __color;
  __truesightClass;
  __decodedStyle;
  __isMisspelled;
  __tokenData;

  constructor(text, color, truesightClass, decodedStyle, isMisspelled, tokenData, key) {
    super(text, key);
    this.__color = color;
    this.__truesightClass = truesightClass;
    this.__decodedStyle = decodedStyle;
    this.__isMisspelled = isMisspelled;
    this.__tokenData = tokenData;
  }

  static getType() {
    return 'truesight-word';
  }

  static clone(node) {
    return new TruesightWordNode(
      node.__text,
      node.__color,
      node.__truesightClass,
      node.__decodedStyle,
      node.__isMisspelled,
      node.__tokenData,
      node.__key,
    );
  }

  createDOM(config) {
    const dom = super.createDOM(config);
    
    addClasses(dom, this.__truesightClass);
    dom.classList.add('grimoire-word');
    
    if (this.__color) {
      dom.style.color = this.__color;
      dom.style.setProperty('--w', this.__color);
      // Explicit fill — parent .editor-textarea sets -webkit-text-fill-color, and
      // some engines inherit the computed ink instead of re-resolving currentColor.
      dom.style.setProperty('-webkit-text-fill-color', this.__color);
    }

    applyDecoded(dom, this.__decodedStyle);

    if (this.__isMisspelled) {
      dom.classList.add('grimoire-word--misspelled');
    }

    // Attach Lexical node key so the click listener can find it
    dom.dataset.lexicalKey = this.__key;
    // The colour's provenance, readable from the DOM. A macrophage sweeping the
    // live page decodes this to tell an honestly grey token from a sick one.
    const chromaStamp = this.__tokenData?.precomputed?.chroma?.bytecode;
    if (chromaStamp) {
      dom.dataset.chroma = chromaStamp;
    }

    return dom;
  }

  updateDOM(prevNode, dom, config) {
    const isUpdated = super.updateDOM(prevNode, dom, config);

    if (prevNode.__color !== this.__color) {
      if (this.__color) {
        dom.style.color = this.__color;
        dom.style.setProperty('--w', this.__color);
        dom.style.setProperty('-webkit-text-fill-color', this.__color);
      } else {
        dom.style.color = '';
        dom.style.removeProperty('--w');
        dom.style.removeProperty('-webkit-text-fill-color');
      }
    }

    if (prevNode.__truesightClass !== this.__truesightClass) {
      removeClasses(dom, prevNode.__truesightClass);
      addClasses(dom, this.__truesightClass);
    }

    if (prevNode.__isMisspelled !== this.__isMisspelled) {
      if (this.__isMisspelled) {
        dom.classList.add('grimoire-word--misspelled');
      } else {
        dom.classList.remove('grimoire-word--misspelled');
      }
    }

    if (prevNode.__decodedStyle !== this.__decodedStyle) {
      removeDecoded(dom, prevNode.__decodedStyle);
      applyDecoded(dom, this.__decodedStyle);
    }

    const nextStamp = this.__tokenData?.precomputed?.chroma?.bytecode;
    const prevStamp = prevNode.__tokenData?.precomputed?.chroma?.bytecode;
    if (nextStamp !== prevStamp) {
      if (nextStamp) dom.dataset.chroma = nextStamp;
      else delete dom.dataset.chroma;
    }

    dom.dataset.lexicalKey = this.__key;

    return isUpdated;
  }

  getTokenData() {
    return this.__tokenData;
  }

  setMisspelled(isMisspelled) {
    const writable = this.getWritable();
    writable.__isMisspelled = isMisspelled;
  }

  exportJSON() {
    return {
      ...super.exportJSON(),
      type: 'truesight-word',
      color: this.__color,
      truesightClass: this.__truesightClass,
      decodedStyle: this.__decodedStyle,
      isMisspelled: this.__isMisspelled,
      tokenData: this.__tokenData,
    };
  }

  static importJSON(serializedNode) {
    const node = $createTruesightWordNode(
      serializedNode.text,
      serializedNode.color,
      serializedNode.truesightClass,
      serializedNode.decodedStyle,
      serializedNode.isMisspelled,
      serializedNode.tokenData
    );
    node.setFormat(serializedNode.format);
    node.setDetail(serializedNode.detail);
    node.setMode(serializedNode.mode);
    node.setStyle(serializedNode.style);
    return node;
  }
}

export function $createTruesightWordNode(text, color, truesightClass, decodedStyle, isMisspelled, tokenData) {
  return new TruesightWordNode(text, color, truesightClass, decodedStyle, isMisspelled, tokenData);
}

export function $isTruesightWordNode(node) {
  return node instanceof TruesightWordNode;
}
